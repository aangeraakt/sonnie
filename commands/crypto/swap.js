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

async function waitForSwapConfirm(interaction, embed) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('swap_confirm_yes').setLabel('Confirm & Broadcast Swap').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('swap_confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  const message = await interaction.editReply({ embeds: [embed], components: [row] });
  if (!message || typeof message.awaitMessageComponent !== 'function') return 'slash-required';

  try {
    const clicked = await message.awaitMessageComponent({
      filter: (btn) => btn.user.id === interaction.user.id && ['swap_confirm_yes', 'swap_confirm_no'].includes(btn.customId),
      time: 60000
    });
    await clicked.deferUpdate().catch(() => {});
    return clicked.customId === 'swap_confirm_yes' ? 'yes' : 'no';
  } catch (err) {
    return 'timeout';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('swap')
    .setDescription('Non-custodial accountless crypto swap between LTC and USDT (TRC-20)')
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
        .setDescription('Swap cryptocurrency directly between your wallets via instant bridge')
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
            .setName('from_wallet')
            .setDescription('Name of source wallet to send from (defaults to default wallet)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('to_wallet')
            .setDescription('Destination wallet name or external receiving address')
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
          { name: '⛓️ Source Network', value: `\`${pair.fromNetwork.toUpperCase()}\``, inline: true },
          { name: '⛓️ Settle Network', value: `\`${pair.toNetwork.toUpperCase()}\``, inline: true }
        ];

        if (inputAmount) {
          fields.push({
            name: '📊 Estimated Output',
            value: `**${inputAmount} ${pair.from}** ➔ **~${estReceive} ${pair.to}**`,
            inline: false
          });
        }

        const embed = createEmbed({
          title: `🔄 Crypto Swap: ${pair.label}`,
          description: 'Non-custodial, accountless cross-chain bridge powered by SideShift.ai.\nNo registration, KYC, or exchange accounts required.',
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

        // Update in DB if we have it recorded
        db.updateSwapOrder(orderId, { status: status.status });

        const statusBadges = {
          waiting: '⏳ Waiting for Deposit',
          pending: '🔄 Deposit Detected (Confirming)',
          processing: '⚡ Converting & Preparing Payout',
          settled: '✅ Settled & Delivered',
          refunded: '↩️ Refunded',
          expired: '❌ Expired'
        };

        const embed = createEmbed({
          title: `🔍 Swap Status: ${status.id}`,
          description: `**Current State:** ${statusBadges[status.status] || status.status}\n[Track on SideShift Explorer](${status.orderUrl})`,
          fields: [
            { name: '📥 Deposited', value: status.depositAmount ? `\`${status.depositAmount} ${status.depositCoin}\`` : '`Awaiting payment`', inline: true },
            { name: '📤 Settled', value: status.settleAmount ? `\`${status.settleAmount} ${status.settleCoin}\`` : '`Pending conversion`', inline: true },
            { name: '📍 Destination', value: `\`${status.settleAddress}\``, inline: false },
            ...(status.depositTx ? [{ name: '🔗 Deposit TxID', value: `\`${status.depositTx}\``, inline: false }] : []),
            ...(status.settleTx ? [{ name: '🔗 Payout TxID', value: `\`${status.settleTx}\``, inline: false }] : [])
          ],
          color: status.status === 'settled' ? 0x2ECC71 : status.status === 'waiting' ? 0xF1C40F : 0x3498DB,
          footerText: `Order ID: ${status.id}`
        });

        return interaction.editReply({ embeds: [embed] });
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
        return `**#${idx + 1}** \`${o.id}\` • **${o.pair}**\nSent: **${o.depositAmount} ${o.depositCoin}** ➔ Est: **${o.estimatedSettleAmount} ${o.settleCoin}**\nStatus: \`${o.status}\` • ${timeStr} • [Order Link](https://sideshift.ai/orders/${o.id})`;
      });

      const embed = createEmbed({
        title: '📜 Your Recent Crypto Swaps',
        description: lines.join('\n\n'),
        color: 0x3498DB,
        footerText: 'Use /swap status <order_id> for live on-chain details'
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
      const fromWalletName = interaction.options.getString('from_wallet');
      const toWalletName = interaction.options.getString('to_wallet');

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

        // --- CASE 1: LTC to USDT ---
        if (direction === 'ltc-to-usdt') {
          const ltcWallet = db.findLtcWallet(userId, fromWalletName);
          if (!ltcWallet) {
            return interaction.editReply({
              embeds: [errorEmbed('No LTC Wallet Found', 'You do not have an LTC wallet to swap from. Create one with `/ltc create`.')]
            });
          }

          let destAddress = null;
          if (toWalletName && usdt.isValidAddress(toWalletName)) {
            destAddress = toWalletName;
          } else {
            const usdtWallet = db.findUsdtWallet(userId, toWalletName);
            if (!usdtWallet) {
              return interaction.editReply({
                embeds: [errorEmbed('No Destination USDT Wallet', 'You do not have a USDT TRC-20 wallet to receive the swap. Create one with `/usdt create` or provide a destination address in `to_wallet`.')]
              });
            }
            destAddress = usdtWallet.address;
          }

          // Balance check
          const [utxos, satPerVb] = await Promise.all([
            ltc.getUtxos(ltcWallet.address),
            ltc.getFeeRate()
          ]);
          const userBalSats = ltc.balanceFromUtxos(utxos);
          const amountSats = ltc.toSats(amount);

          if (userBalSats < amountSats + 1000) {
            return interaction.editReply({
              embeds: [errorEmbed('Insufficient LTC', `**${ltcWallet.name}** holds **${ltc.fromSats(userBalSats)} LTC**, which is less than the required **${amount} LTC** plus miner network fee.`)]
            });
          }

          let ltcWif;
          try {
            ltcWif = ltc.decryptSecret(ltcWallet.secret);
          } catch (e) {
            return interaction.editReply({ embeds: [errorEmbed('Wallet Locked', 'Could not decrypt LTC wallet. Check `LTC_ENCRYPTION_KEY`.')] });
          }

          const preview = createEmbed({
            title: 'Confirm Cross-Chain Swap: LTC ➔ USDT',
            description: `You are about to swap **${amount} LTC** for approximately **~${estReceive} USDT (TRC-20)**.\n\n` +
              `• **From (LTC):** **${ltcWallet.name}** (\`${ltcWallet.address}\`)\n` +
              `• **To (USDT):** \`${destAddress}\`\n` +
              `• **Rate:** \`1 LTC ≈ ${pair.rate.toFixed(4)} USDT\`\n` +
              `• **Bridge Provider:** SideShift.ai (Non-Custodial)\n\n` +
              `*Funds will be broadcasted on-chain to the bridge and settled to your Tron address.*`,
            color: 0x3498DB,
            footerText: 'This action cannot be undone once broadcasted'
          });

          const decision = await waitForSwapConfirm(interaction, preview);
          if (decision !== 'yes') {
            return interaction.editReply({
              embeds: [errorEmbed('Swap Cancelled', decision === 'timeout' ? 'Confirmation timed out.' : 'You cancelled the swap.')],
              components: []
            });
          }

          await interaction.editReply({
            embeds: [createEmbed({ title: '🔄 Creating Bridge Shift...', description: 'Contacting SideShift non-custodial bridge...', color: 0xF1C40F })],
            components: []
          });

          const shift = await swapBridge.createShift({
            direction,
            settleAddress: destAddress,
            refundAddress: ltcWallet.address,
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

          // Broadcast LTC to bridge deposit address
          await interaction.editReply({
            embeds: [createEmbed({ title: '📡 Broadcasting LTC Payment...', description: `Sending **${amount} LTC** to bridge deposit address \`${shift.depositAddress}\`...`, color: 0xF1C40F })]
          });

          const sendResult = await ltc.sendLtc(ltcWif, ltcWallet.address, shift.depositAddress, amountSats, utxos, satPerVb);
          if (sendResult.error) {
            return interaction.editReply({
              embeds: [errorEmbed('LTC Broadcast Failed', `Bridge order was created (\`${shift.id}\`), but LTC payment failed: ${sendResult.error}`)]
            });
          }

          db.addSwapOrder(userId, {
            id: shift.id,
            pair: 'LTC ➔ USDT',
            depositCoin: 'LTC',
            settleCoin: 'USDT',
            depositAmount: amount,
            estimatedSettleAmount: estReceive,
            depositTxid: sendResult.txid,
            depositAddress: shift.depositAddress,
            settleAddress: destAddress,
            createdAt: new Date().toISOString(),
            status: 'pending'
          });

          const success = createEmbed({
            title: '🎉 Swap Broadcasted Successfully!',
            description: `Your **${amount} LTC** payment was broadcasted to the bridge!\n\n` +
              `• **Shift ID:** \`${shift.id}\`\n` +
              `• **Deposit TxID:** [\`${sendResult.txid.slice(0, 16)}...\`](https://blockchair.com/litecoin/transaction/${sendResult.txid})\n` +
              `• **Destination:** \`${destAddress}\`\n` +
              `• **Estimated Payout:** **~${estReceive} USDT**\n\n` +
              `The bridge will detect your transaction and deliver the USDT directly to your wallet once confirmed.\n` +
              `[**Track Swap Progress on SideShift**](${shift.orderUrl})`,
            color: 0x2ECC71,
            footerText: `Track live with /swap status order_id:${shift.id}`
          });

          return interaction.editReply({ embeds: [success] });
        }

        // --- CASE 2: USDT to LTC ---
        if (direction === 'usdt-to-ltc') {
          const usdtWallet = db.findUsdtWallet(userId, fromWalletName);
          if (!usdtWallet) {
            return interaction.editReply({
              embeds: [errorEmbed('No USDT Wallet Found', 'You do not have a USDT TRC-20 wallet to swap from. Create one with `/usdt create`.')]
            });
          }

          let destAddress = null;
          if (toWalletName && ltc.isValidAddress(toWalletName)) {
            destAddress = toWalletName;
          } else {
            const ltcWallet = db.findLtcWallet(userId, toWalletName);
            if (!ltcWallet) {
              return interaction.editReply({
                embeds: [errorEmbed('No Destination LTC Wallet', 'You do not have an LTC wallet to receive the swap. Create one with `/ltc create` or provide a destination address in `to_wallet`.')]
              });
            }
            destAddress = ltcWallet.address;
          }

          // Balance check
          const info = await usdt.getAddressInfo(usdtWallet.address);
          const bal = usdt.balanceFromInfo(info);
          const amountUnits = usdt.toUnits(amount);

          if (bal.usdt < amountUnits) {
            return interaction.editReply({
              embeds: [errorEmbed('Insufficient USDT', `**${usdtWallet.name}** holds **${usdt.fromUnits(bal.usdt)} USDT**, which is less than the required **${amount} USDT**.`)]
            });
          }

          if (bal.trx < 5000000) {
            return interaction.editReply({
              embeds: [errorEmbed('Insufficient TRX for Energy', `This wallet only holds **${usdt.fromSun(bal.trx)} TRX**. TRC-20 transfers require ~7–25 TRX to cover network energy fees. Please deposit some TRX before swapping.`)]
            });
          }

          let usdtSecret;
          try {
            usdtSecret = usdt.decryptSecret(usdtWallet.secret);
          } catch (e) {
            return interaction.editReply({ embeds: [errorEmbed('Wallet Locked', 'Could not decrypt USDT wallet. Check `USDT_ENCRYPTION_KEY`.')] });
          }

          const preview = createEmbed({
            title: 'Confirm Cross-Chain Swap: USDT ➔ LTC',
            description: `You are about to swap **${amount} USDT** for approximately **~${estReceive} LTC**.\n\n` +
              `• **From (USDT TRC-20):** **${usdtWallet.name}** (\`${usdtWallet.address}\`)\n` +
              `• **To (LTC):** \`${destAddress}\`\n` +
              `• **Rate:** \`1 USDT ≈ ${pair.rate.toFixed(6)} LTC\`\n` +
              `• **Bridge Provider:** SideShift.ai (Non-Custodial)\n\n` +
              `*Funds will be broadcasted on Tron to the bridge and settled to your Litecoin address.*`,
            color: 0x3498DB,
            footerText: 'This action cannot be undone once broadcasted'
          });

          const decision = await waitForSwapConfirm(interaction, preview);
          if (decision !== 'yes') {
            return interaction.editReply({
              embeds: [errorEmbed('Swap Cancelled', decision === 'timeout' ? 'Confirmation timed out.' : 'You cancelled the swap.')],
              components: []
            });
          }

          await interaction.editReply({
            embeds: [createEmbed({ title: '🔄 Creating Bridge Shift...', description: 'Contacting SideShift non-custodial bridge...', color: 0xF1C40F })],
            components: []
          });

          const shift = await swapBridge.createShift({
            direction,
            settleAddress: destAddress,
            refundAddress: usdtWallet.address,
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

          // Broadcast USDT on Tron to bridge deposit address
          await interaction.editReply({
            embeds: [createEmbed({ title: '📡 Broadcasting TRC-20 Transfer...', description: `Sending **${amount} USDT** to bridge deposit address \`${shift.depositAddress}\`...`, color: 0xF1C40F })]
          });

          const sendResult = await usdt.sendUsdt(usdtSecret, usdtWallet.address, shift.depositAddress, amountUnits);
          if (sendResult.error) {
            return interaction.editReply({
              embeds: [errorEmbed('USDT Broadcast Failed', `Bridge order was created (\`${shift.id}\`), but TRC-20 payment failed: ${sendResult.error}`)]
            });
          }

          db.addSwapOrder(userId, {
            id: shift.id,
            pair: 'USDT ➔ LTC',
            depositCoin: 'USDT',
            settleCoin: 'LTC',
            depositAmount: amount,
            estimatedSettleAmount: estReceive,
            depositTxid: sendResult.txid,
            depositAddress: shift.depositAddress,
            settleAddress: destAddress,
            createdAt: new Date().toISOString(),
            status: 'pending'
          });

          const success = createEmbed({
            title: '🎉 Swap Broadcasted Successfully!',
            description: `Your **${amount} USDT** transfer was broadcasted to the bridge!\n\n` +
              `• **Shift ID:** \`${shift.id}\`\n` +
              `• **Deposit TxID:** [\`${sendResult.txid.slice(0, 16)}...\`](https://tronscan.org/#/transaction/${sendResult.txid})\n` +
              `• **Destination:** \`${destAddress}\`\n` +
              `• **Estimated Payout:** **~${estReceive} LTC**\n\n` +
              `The bridge will detect your Tron transaction and deliver the native LTC directly to your wallet once confirmed.\n` +
              `[**Track Swap Progress on SideShift**](${shift.orderUrl})`,
            color: 0x2ECC71,
            footerText: `Track live with /swap status order_id:${shift.id}`
          });

          return interaction.editReply({ embeds: [success] });
        }
      } catch (err) {
        return interaction.editReply({
          embeds: [errorEmbed('Swap Failed', err.message || 'An error occurred during the swap process.')]
        });
      }
    }
  }
};
