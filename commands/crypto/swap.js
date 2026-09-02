const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database/db');
const ltc = require('../../utils/ltcWallet');
const usdt = require('../../utils/usdtWallet');
const swapBridge = require('../../utils/swapBridge');
const { createEmbed, errorEmbed, successEmbed, warningEmbed, COLORS } = require('../../utils/embedBuilder');

const STATUS_BADGES = {
  waiting: '⏳ Waiting for Deposit',
  pending: '🔄 Deposit Detected (Confirming on-chain)',
  processing: '⚡ Converting & Preparing Payout',
  settled: '✅ Settled & Delivered',
  refunded: '↩️ Refunded',
  expired: '❌ Expired'
};

function renderStatusEmbed(status) {
  return createEmbed({
    title: `🔍 Swap Order: ${status.id}`,
    description: `**Status:** ${STATUS_BADGES[status.status] || status.status}\n[Track on SideShift Explorer](${status.orderUrl})`,
    fields: [
      { name: '📥 Deposited', value: status.depositAmount ? `\`${status.depositAmount} ${status.depositCoin}\`` : '`Awaiting deposit`', inline: true },
      { name: '📤 Settled', value: status.settleAmount ? `\`${status.settleAmount} ${status.settleCoin}\`` : '`Pending conversion`', inline: true },
      { name: '📍 Destination', value: `\`${status.settleAddress}\``, inline: false },
      ...(status.depositTx ? [{ name: '🔗 Deposit TxID', value: `\`${status.depositTx}\``, inline: false }] : []),
      ...(status.settleTx ? [{ name: '🔗 Payout TxID', value: `\`${status.settleTx}\``, inline: false }] : [])
    ],
    color: status.status === 'settled' ? 0x2ECC71 : status.status === 'waiting' ? 0xF1C40F : 0x3498DB,
    footerText: `Order ID: ${status.id}`
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('swap')
    .setDescription('Non-custodial cross-chain crypto swap between LTC and USDT (TRC-20)')
    .addSubcommand(sub =>
      sub
        .setName('rate')
        .setDescription('View current bridge exchange rates and limits')
        .addStringOption(opt =>
          opt
            .setName('direction')
            .setDescription('Swap direction')
            .addChoices(
              { name: 'Litecoin (LTC) ➔ Tether (USDT TRC-20)', value: 'ltc-to-usdt' },
              { name: 'Tether (USDT TRC-20) ➔ Litecoin (LTC)', value: 'usdt-to-ltc' }
            )
            .setRequired(false)
        )
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('Estimate how much you will receive for this amount')
            .setMinValue(0.0001)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('execute')
        .setDescription('Initiate a cross-chain swap (supports bot wallets & external wallets)')
        .addStringOption(opt =>
          opt
            .setName('direction')
            .setDescription('Swap direction')
            .addChoices(
              { name: 'Litecoin (LTC) ➔ Tether (USDT TRC-20)', value: 'ltc-to-usdt' },
              { name: 'Tether (USDT TRC-20) ➔ Litecoin (LTC)', value: 'usdt-to-ltc' }
            )
            .setRequired(true)
        )
        .addNumberOption(opt =>
          opt
            .setName('amount')
            .setDescription('Amount of source coins to swap')
            .setMinValue(0.0001)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('destination')
            .setDescription('Where to receive swapped funds: your crypto address or bot wallet name')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('from_wallet')
            .setDescription('Bot wallet name to auto-pay from (leave blank to deposit from external wallet)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Track the live progress of an ongoing bridge swap')
        .addStringOption(opt =>
          opt
            .setName('order_id')
            .setDescription('The bridge shift order ID (e.g. from /swap execute)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('View your recent crypto swap orders and their status')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // -------------------------------------------------------------
    // /swap rate
    // -------------------------------------------------------------
    if (subcommand === 'rate') {
      await interaction.deferReply();
      const direction = interaction.options.getString('direction') || 'ltc-to-usdt';
      const inputAmount = interaction.options.getNumber('amount');

      try {
        const pair = await swapBridge.getPairRate(direction);
        const estReceive = inputAmount ? (inputAmount * pair.rate).toFixed(direction === 'ltc-to-usdt' ? 2 : 6) : null;

        const fields = [
          { name: '💱 Live Rate', value: `\`1 ${pair.from} ≈ ${pair.rate.toFixed(4)} ${pair.to}\``, inline: true },
          { name: '📉 Min Deposit', value: `\`${pair.min} ${pair.from}\``, inline: true },
          { name: '📈 Max Deposit', value: `\`${pair.max.toLocaleString()} ${pair.from}\``, inline: true },
          { name: '⛓️ Deposit Chain', value: `\`${pair.fromNetwork.toUpperCase()}\``, inline: true },
          { name: '⛓️ Receive Chain', value: `\`${pair.toNetwork.toUpperCase()}\``, inline: true }
        ];

        if (inputAmount) {
          fields.push({
            name: '📊 Estimated Output',
            value: `**${inputAmount} ${pair.from}** ➔ **~${estReceive} ${pair.to}**`,
            inline: false
          });
        }

        const embed = createEmbed({
          title: `🔄 Crypto Swap Rate: ${pair.label}`,
          description: 'Non-custodial, accountless cross-chain bridge powered by SideShift.ai.\nNo registration, KYC, or centralized exchange accounts required.',
          fields,
          color: 0x3498DB,
          footerText: 'Swap directly with /swap execute'
        });

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed('Bridge Error', err.message || 'Could not fetch live swap rate.')] });
      }
    }

    // -------------------------------------------------------------
    // /swap status
    // -------------------------------------------------------------
    if (subcommand === 'status') {
      await interaction.deferReply();
      const orderId = interaction.options.getString('order_id').trim();

      try {
        const status = await swapBridge.getShiftStatus(orderId);
        if (!status) {
          return interaction.editReply({
            embeds: [errorEmbed('Order Not Found', `No bridge swap order found with ID \`${orderId}\`.`)]
          });
        }

        db.updateSwapOrder(orderId, { status: status.status });
        const embed = renderStatusEmbed(status);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`refresh_status_${orderId}`).setLabel('🔄 Refresh Status').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setLabel('SideShift Explorer').setStyle(ButtonStyle.Link).setURL(status.orderUrl)
        );

        const replyMsg = await interaction.editReply({ embeds: [embed], components: [row] });

        // Interactive status refresher
        const collector = replyMsg.createMessageComponentCollector({
          filter: (btn) => btn.customId === `refresh_status_${orderId}`,
          time: 300000 // 5 minutes
        });

        collector.on('collect', async (btnInteraction) => {
          await btnInteraction.deferUpdate();
          const fresh = await swapBridge.getShiftStatus(orderId).catch(() => null);
          if (fresh) {
            db.updateSwapOrder(orderId, { status: fresh.status });
            await btnInteraction.editReply({ embeds: [renderStatusEmbed(fresh)] }).catch(() => {});
          }
        });

        return;
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', err.message || 'Could not retrieve order status.')] });
      }
    }

    // -------------------------------------------------------------
    // /swap history
    // -------------------------------------------------------------
    if (subcommand === 'history') {
      const orders = db.getSwapOrders(userId);
      if (!orders.length) {
        return interaction.reply({
          embeds: [warningEmbed('No Swap History', 'You have not initiated any crypto swaps yet.\nUse `/swap execute` to start one.')],
          flags: 64
        });
      }

      const lines = orders.slice(0, 10).map((o, idx) => {
        const timeStr = o.createdAt ? `<t:${Math.floor(new Date(o.createdAt).getTime() / 1000)}:R>` : '';
        return `**#${idx + 1}** \`${o.id}\` • **${o.pair}**\nSent: **${o.depositAmount || '?'} ${o.depositCoin}** ➔ Est: **${o.estimatedSettleAmount || '?'} ${o.settleCoin}**\nStatus: \`${o.status}\` • ${timeStr} • [Order Link](https://sideshift.ai/orders/${o.id})`;
      });

      const embed = createEmbed({
        title: '📜 Your Recent Crypto Swaps',
        description: lines.join('\n\n'),
        color: 0x3498DB,
        footerText: 'Use /swap status order_id:<id> for live on-chain details'
      });

      return interaction.reply({ embeds: [embed] });
    }

    // -------------------------------------------------------------
    // /swap execute
    // -------------------------------------------------------------
    if (subcommand === 'execute') {
      await interaction.deferReply();
      const direction = interaction.options.getString('direction');
      const amount = interaction.options.getNumber('amount');
      const destInput = interaction.options.getString('destination');
      const fromWalletName = interaction.options.getString('from_wallet');

      try {
        const pair = await swapBridge.getPairRate(direction);

        if (amount < pair.min) {
          return interaction.editReply({
            embeds: [errorEmbed('Amount Below Minimum', `The minimum bridge swap amount for ${pair.from} is **${pair.min} ${pair.from}**.`)]
          });
        }
        if (amount > pair.max) {
          return interaction.editReply({
            embeds: [errorEmbed('Amount Above Maximum', `The maximum bridge swap amount for ${pair.from} is **${pair.max.toLocaleString()} ${pair.from}**.`)]
          });
        }

        const estReceive = (amount * pair.rate).toFixed(direction === 'ltc-to-usdt' ? 2 : 6);

        // ============================================================
        // 1. RESOLVE DESTINATION ADDRESS
        // ============================================================
        let destAddress = null;

        if (direction === 'ltc-to-usdt') {
          // Destination must be a Tron address
          if (destInput) {
            if (usdt.isValidAddress(destInput)) {
              destAddress = destInput;
            } else {
              const matchedWallet = db.findUsdtWallet(userId, destInput);
              if (matchedWallet) destAddress = matchedWallet.address;
            }
          } else {
            const defaultUsdtWallet = db.findUsdtWallet(userId);
            if (defaultUsdtWallet) destAddress = defaultUsdtWallet.address;
          }

          if (!destAddress) {
            return interaction.editReply({
              embeds: [errorEmbed(
                'No Destination Address',
                'Please specify where to send your swapped USDT:\n\n' +
                '• **Option A:** Enter an external Tron address in `destination` (e.g. `destination: T...`)\n' +
                '• **Option B:** Create a built-in bot wallet with `/usdt create` first.'
              )]
            });
          }
        } else {
          // Destination must be a Litecoin address
          if (destInput) {
            if (ltc.isValidAddress(destInput)) {
              destAddress = destInput;
            } else {
              const matchedWallet = db.findLtcWallet(userId, destInput);
              if (matchedWallet) destAddress = matchedWallet.address;
            }
          } else {
            const defaultLtcWallet = db.findLtcWallet(userId);
            if (defaultLtcWallet) destAddress = defaultLtcWallet.address;
          }

          if (!destAddress) {
            return interaction.editReply({
              embeds: [errorEmbed(
                'No Destination Address',
                'Please specify where to send your swapped Litecoin:\n\n' +
                '• **Option A:** Enter an external Litecoin address in `destination` (e.g. `destination: ltc1q...` or `L...`)\n' +
                '• **Option B:** Create a built-in bot wallet with `/ltc create` first.'
              )]
            });
          }
        }

        // ============================================================
        // 2. CHECK IF USER HAS A BOT WALLET FOR AUTO-PAY
        // ============================================================
        let autoPayWallet = null;
        let ltcWif = null;
        let usdtSecret = null;
        let canAutoPay = false;

        if (direction === 'ltc-to-usdt') {
          const ltcWallet = db.findLtcWallet(userId, fromWalletName);
          if (ltcWallet) {
            try {
              const utxos = await ltc.getUtxos(ltcWallet.address);
              const userBalSats = ltc.balanceFromUtxos(utxos);
              const amountSats = ltc.toSats(amount);
              if (userBalSats >= amountSats + 1000) {
                ltcWif = ltc.decryptSecret(ltcWallet.secret);
                autoPayWallet = ltcWallet;
                canAutoPay = true;
              }
            } catch (e) {}
          }
        } else {
          const usdtWallet = db.findUsdtWallet(userId, fromWalletName);
          if (usdtWallet) {
            try {
              const info = await usdt.getAddressInfo(usdtWallet.address);
              const bal = usdt.balanceFromInfo(info);
              const amountUnits = usdt.toUnits(amount);
              if (bal.usdt >= amountUnits && bal.trx >= 5000000) {
                usdtSecret = usdt.decryptSecret(usdtWallet.secret);
                autoPayWallet = usdtWallet;
                canAutoPay = true;
              }
            } catch (e) {}
          }
        }

        // ============================================================
        // 3. DECIDE EXECUTION FLOW: AUTO-PAY VS EXTERNAL DEPOSIT
        // ============================================================
        let selectedMode = 'external';

        if (canAutoPay) {
          const promptEmbed = createEmbed({
            title: `🔄 Cross-Chain Swap: ${pair.from} ➔ ${pair.to}`,
            description: `You are swapping **${amount} ${pair.from}** for approximately **~${estReceive} ${pair.to}**.\n\n` +
              `• **Destination:** \`${destAddress}\`\n` +
              `• **Live Rate:** \`1 ${pair.from} ≈ ${pair.rate.toFixed(4)} ${pair.to}\`\n` +
              `• **Bridge Provider:** SideShift.ai (Non-Custodial)\n\n` +
              `You have a bot wallet (**${autoPayWallet.name}**) with sufficient funds! How would you like to pay?`,
            color: 0x3498DB
          });

          const choiceRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('swap_mode_auto').setLabel(`⚡ Auto-Pay from ${autoPayWallet.name}`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('swap_mode_external').setLabel('📱 Deposit from External Wallet').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('swap_mode_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
          );

          const choiceMsg = await interaction.editReply({ embeds: [promptEmbed], components: [choiceRow] });
          try {
            const btnClick = await choiceMsg.awaitMessageComponent({
              filter: (b) => b.user.id === userId && ['swap_mode_auto', 'swap_mode_external', 'swap_mode_cancel'].includes(b.customId),
              time: 45000
            });
            await btnClick.deferUpdate().catch(() => {});
            if (btnClick.customId === 'swap_mode_cancel') {
              return interaction.editReply({ embeds: [warningEmbed('Swap Cancelled', 'You cancelled the swap.')], components: [] });
            }
            selectedMode = btnClick.customId === 'swap_mode_auto' ? 'auto' : 'external';
          } catch (e) {
            return interaction.editReply({ embeds: [warningEmbed('Swap Timed Out', 'Confirmation timed out.')], components: [] });
          }
        }

        // ============================================================
        // 4. CREATE BRIDGE SHIFT ORDER
        // ============================================================
        await interaction.editReply({
          embeds: [createEmbed({ title: '🔄 Creating Bridge Shift...', description: 'Requesting deposit address from SideShift non-custodial bridge...', color: 0xF1C40F })],
          components: []
        });

        const refundAddress = (direction === 'ltc-to-usdt' ? db.findLtcWallet(userId)?.address : db.findUsdtWallet(userId)?.address) || null;

        const shift = await swapBridge.createShift({
          direction,
          settleAddress: destAddress,
          refundAddress,
          depositAmount: amount
        });

        if (!shift.automated) {
          return interaction.editReply({
            embeds: [createEmbed({
              title: 'Instant Web Bridge Link',
              description: `${shift.message}\n\n[Click here to complete your swap on SideShift.ai](${shift.webUrl})`,
              color: 0x3498DB
            })]
          });
        }

        // Save order to history
        db.addSwapOrder(userId, {
          id: shift.id,
          pair: `${pair.from} ➔ ${pair.to}`,
          depositCoin: pair.from,
          settleCoin: pair.to,
          depositAmount: amount,
          estimatedSettleAmount: estReceive,
          depositAddress: shift.depositAddress,
          settleAddress: destAddress,
          createdAt: new Date().toISOString(),
          status: 'waiting'
        });

        // ============================================================
        // 5A. EXECUTION: AUTO-PAY FROM BOT WALLET
        // ============================================================
        if (selectedMode === 'auto') {
          await interaction.editReply({
            embeds: [createEmbed({
              title: '📡 Broadcasting On-Chain Payment...',
              description: `Sending **${amount} ${pair.from}** to bridge deposit address \`${shift.depositAddress}\`...`,
              color: 0xF1C40F
            })]
          });

          let sendResult;
          if (direction === 'ltc-to-usdt') {
            const [utxos, satPerVb] = await Promise.all([ltc.getUtxos(autoPayWallet.address), ltc.getFeeRate()]);
            sendResult = await ltc.sendLtc(ltcWif, autoPayWallet.address, shift.depositAddress, ltc.toSats(amount), utxos, satPerVb);
          } else {
            sendResult = await usdt.sendUsdt(usdtSecret, autoPayWallet.address, shift.depositAddress, usdt.toUnits(amount));
          }

          if (sendResult.error) {
            return interaction.editReply({
              embeds: [errorEmbed('Broadcast Failed', `Bridge order was created (\`${shift.id}\`), but payment failed: ${sendResult.error}`)]
            });
          }

          db.updateSwapOrder(shift.id, { status: 'pending', depositTxid: sendResult.txid });

          const explorerUrl = direction === 'ltc-to-usdt'
            ? `https://blockchair.com/litecoin/transaction/${sendResult.txid}`
            : `https://tronscan.org/#/transaction/${sendResult.txid}`;

          const successEmbed = createEmbed({
            title: '🎉 Swap Broadcasted Successfully!',
            description: `Your payment was broadcasted to the bridge!\n\n` +
              `• **Shift ID:** \`${shift.id}\`\n` +
              `• **Deposit TxID:** [\`${sendResult.txid.slice(0, 18)}...\`](${explorerUrl})\n` +
              `• **Destination:** \`${destAddress}\`\n` +
              `• **Estimated Output:** **~${estReceive} ${pair.to}**\n\n` +
              `The bridge will detect your transaction and deliver the ${pair.to} directly to your wallet once confirmed.\n` +
              `[**Track Swap Progress on SideShift**](${shift.orderUrl})`,
            color: 0x2ECC71,
            footerText: `Track live with /swap status order_id:${shift.id}`
          });

          const trackRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`refresh_status_${shift.id}`).setLabel('🔄 Check Live Status').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setLabel('SideShift Explorer').setStyle(ButtonStyle.Link).setURL(shift.orderUrl)
          );

          return interaction.editReply({ embeds: [successEmbed], components: [trackRow] });
        }

        // ============================================================
        // 5B. EXECUTION: EXTERNAL DEPOSIT (QR CODE & DEPOSIT ADDRESS)
        // ============================================================
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shift.depositAddress)}`;

        const depositEmbed = createEmbed({
          title: `📥 Deposit Address Ready: ${pair.from} ➔ ${pair.to}`,
          description: `Send exactly **${amount} ${pair.from}** from your external wallet to the bridge deposit address below:\n\n` +
            `\`\`\`\n${shift.depositAddress}\n\`\`\`\n` +
            `• **Deposit Amount:** **${amount} ${pair.from}**\n` +
            `• **You Will Receive:** **~${estReceive} ${pair.to}**\n` +
            `• **Destination Address:** \`${destAddress}\`\n` +
            `• **Shift Order ID:** \`${shift.id}\`\n\n` +
            `💡 *Scan the QR code or copy the address into Exodus, Trust Wallet, Phantom, Binance, or any other wallet.*`,
          image: qrCodeUrl,
          color: 0x3498DB,
          footerText: `Order ID: ${shift.id} • Use /swap status order_id:${shift.id}`
        });

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`refresh_status_${shift.id}`).setLabel('🔄 Check Deposit Status').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setLabel('SideShift Explorer').setStyle(ButtonStyle.Link).setURL(shift.orderUrl)
        );

        const replyMsg = await interaction.editReply({ embeds: [depositEmbed], components: [actionRow] });

        // Allow user to click "Check Deposit Status" directly on this embed
        const collector = replyMsg.createMessageComponentCollector({
          filter: (btn) => btn.user.id === userId && btn.customId === `refresh_status_${shift.id}`,
          time: 600000 // 10 minutes
        });

        collector.on('collect', async (btnInteraction) => {
          await btnInteraction.deferUpdate();
          const fresh = await swapBridge.getShiftStatus(shift.id).catch(() => null);
          if (fresh) {
            db.updateSwapOrder(shift.id, { status: fresh.status });
            if (fresh.status !== 'waiting') {
              await btnInteraction.editReply({ embeds: [renderStatusEmbed(fresh)] }).catch(() => {});
            } else {
              await btnInteraction.followUp({
                content: '⏳ Deposit not detected yet. Please ensure you sent the transaction and wait for on-chain confirmation.',
                flags: 64
              }).catch(() => {});
            }
          }
        });

        return;
      } catch (err) {
        return interaction.editReply({
          embeds: [errorEmbed('Swap Failed', err.message || 'An error occurred during the swap process.')]
        });
      }
    }
  }
};
