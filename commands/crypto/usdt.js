const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed, warningEmbed, infoEmbed } = require('../../utils/embedBuilder');
const usdt = require('../../utils/usdtWallet');
const Logger = require('../../utils/logger');

function walletOrReply(interaction, name) {
  const wallet = db.findUsdtWallet(interaction.user.id, name);
  if (wallet) return wallet;
  return null;
}

function missingWalletReply(interaction) {
  return interaction.editReply({
    embeds: [errorEmbed('No USDT Wallet', 'Create one first with `/usdt create`.')]
  });
}

function usdLine(units, price) {
  if (!price) return '';
  return ` (~$${(units / usdt.UNITS * price).toFixed(2)})`;
}

async function waitForSendConfirm(interaction, embed) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('usdt_send_yes').setLabel('Send USDT').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('usdt_send_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  const message = await interaction.editReply({ embeds: [embed], components: [row] });
  if (!message || typeof message.awaitMessageComponent !== 'function') return 'slash-required';
  try {
    const clicked = await message.awaitMessageComponent({
      filter: (btn) => btn.user.id === interaction.user.id && (btn.customId === 'usdt_send_yes' || btn.customId === 'usdt_send_no'),
      time: 60000
    });
    await clicked.deferUpdate().catch(() => {});
    return clicked.customId === 'usdt_send_yes' ? 'yes' : 'no';
  } catch (err) {
    return 'timeout';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('usdt')
    .setDescription('TRC-20 USDT wallets, send, receive, and transactions')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new TRC-20 USDT wallet')
        .addStringOption(opt => opt.setName('name').setDescription('Wallet name').setRequired(false).setMaxLength(24))
    )
    .addSubcommand(sub =>
      sub
        .setName('wallets')
        .setDescription('List your USDT wallets')
    )
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription('Check a USDT wallet balance')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('receive')
        .setDescription('Show a TRC-20 USDT deposit address')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('send')
        .setDescription('Send TRC-20 USDT to a Tron address')
        .addStringOption(opt => opt.setName('address').setDescription('Destination Tron address').setRequired(true))
        .addNumberOption(opt => opt.setName('amount').setDescription('Amount in USDT').setRequired(true).setMinValue(0.01))
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet to send from').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('transactions')
        .setDescription('View recent USDT transactions')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('export')
        .setDescription('Show a wallet private key privately')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete an empty USDT wallet')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (subcommand === 'export' && interaction.sourceMessage) {
      return interaction.reply({
        embeds: [errorEmbed('Use Slash Command', 'Private keys can only be exported with `/usdt export` as a hidden reply.')]
      });
    }

    if (subcommand === 'create') {
      const wallets = db.getUsdtWallets(userId);
      if (wallets.length >= usdt.MAX_WALLETS) {
        return interaction.reply({
          embeds: [errorEmbed('Wallet Limit', `You can keep up to ${usdt.MAX_WALLETS} USDT wallets.`)],
          flags: 64
        });
      }
      const used = wallets.map((wallet) => wallet.name.toLowerCase());
      const name = usdt.normalizeName(interaction.options.getString('name'), used);
      if (used.includes(name.toLowerCase())) {
        return interaction.reply({
          embeds: [errorEmbed('Name In Use', `You already have a wallet named \`${name}\`.`)],
          flags: 64
        });
      }
      const generated = usdt.createKeypair();
      db.addUsdtWallet(userId, {
        id: crypto.randomUUID(),
        name,
        address: generated.address,
        secret: usdt.encryptSecret(generated.secret),
        created_at: new Date().toISOString()
      });
      return interaction.reply({
        embeds: [successEmbed('USDT Wallet Created', `**Name:** \`${name}\`\n**Address:** \`${generated.address}\`\n**Network:** TRC-20 (Tron)\n\nShare this address to receive USDT on Tron only. Do not send ERC-20 or other networks.\nThis address also needs a little TRX to pay send fees.\nView it later with \`/usdt receive\`.`)],
        flags: 64
      });
    }

    if (subcommand === 'wallets') {
      const wallets = db.getUsdtWallets(userId);
      if (!wallets.length) {
        return interaction.reply({
          embeds: [infoEmbed('No Wallets', 'You have no USDT wallets yet. Use `/usdt create`.')],
          flags: 64
        });
      }
      await interaction.deferReply({ flags: 64 });
      const price = await usdt.getUsdPrice();
      const lines = [];
      for (const wallet of wallets) {
        try {
          const info = await usdt.getAddressInfo(wallet.address);
          const bal = usdt.balanceFromInfo(info);
          lines.push(`**${wallet.name}**\n\`${wallet.address}\`\n${usdt.fromUnits(bal.usdt)} USDT${usdLine(bal.usdt, price)} · ${usdt.fromSun(bal.trx)} TRX`);
        } catch (err) {
          lines.push(`**${wallet.name}**\n\`${wallet.address}\`\nBalance unavailable`);
        }
      }
      return interaction.editReply({
        embeds: [createEmbed({
          title: 'USDT Wallets',
          description: lines.join('\n\n'),
          footerText: 'Sonnies USDT · TRC-20'
        })]
      });
    }

    if (subcommand === 'balance') {
      await interaction.deferReply();
      const wallet = walletOrReply(interaction, interaction.options.getString('wallet'));
      if (!wallet) return missingWalletReply(interaction);
      try {
        const [info, price] = await Promise.all([usdt.getAddressInfo(wallet.address), usdt.getUsdPrice()]);
        const bal = usdt.balanceFromInfo(info);
        return interaction.editReply({
          embeds: [createEmbed({
            title: `USDT Balance - ${wallet.name}`,
            url: usdt.explorerAddress(wallet.address),
            description: `\`${wallet.address}\``,
            fields: [
              { name: 'USDT', value: `**${usdt.fromUnits(bal.usdt)} USDT**${usdLine(bal.usdt, price)}`, inline: true },
              { name: 'TRX', value: `**${usdt.fromSun(bal.trx)} TRX**`, inline: true },
              { name: 'Network', value: 'TRC-20', inline: true }
            ],
            footerText: 'Sonnies USDT · TRC-20'
          })]
        });
      } catch (err) {
        Logger.error('USDT balance failed:', err.message);
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', 'Could not read this wallet from the Tron network.')] });
      }
    }

    if (subcommand === 'receive') {
      const wallet = db.findUsdtWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('No USDT Wallet', 'Create one first with `/usdt create`.')],
          flags: 64
        });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Receive USDT - ${wallet.name}`,
          description: `Send **TRC-20 USDT** on Tron to this address. Do not send ERC-20, BEP-20, or other networks.\n\n\`${wallet.address}\`\n[Open in explorer](${usdt.explorerAddress(wallet.address)})\n\nKeep a little TRX here as well. Sends burn energy from TRX.`,
          image: usdt.qrUrl(wallet.address),
          footerText: 'Sonnies USDT · TRC-20'
        })]
      });
    }

    if (subcommand === 'send') {
      const wallet = db.findUsdtWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('No USDT Wallet', 'Create one first with `/usdt create`.')],
          flags: 64
        });
      }
      const address = interaction.options.getString('address');
      const amount = interaction.options.getNumber('amount');
      const amountUnits = usdt.toUnits(amount);
      if (!usdt.isValidAddress(address)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Address', 'That is not a valid Tron address.')],
          flags: 64
        });
      }
      if (!amountUnits || amountUnits < 10000) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Amount', 'Minimum send amount is 0.01 USDT.')],
          flags: 64
        });
      }
      if (address === wallet.address) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Destination', 'Choose a different address than this wallet.')],
          flags: 64
        });
      }

      await interaction.deferReply();
      try {
        const [info, price] = await Promise.all([
          usdt.getAddressInfo(wallet.address),
          usdt.getUsdPrice()
        ]);
        const bal = usdt.balanceFromInfo(info);
        if (bal.usdt < amountUnits) {
          return interaction.editReply({
            embeds: [errorEmbed('Insufficient USDT', `**${wallet.name}** holds ${usdt.fromUnits(bal.usdt)} USDT, which is less than ${usdt.fromUnits(amountUnits)} USDT.`)]
          });
        }
        if (bal.trx < 5000000) {
          return interaction.editReply({
            embeds: [errorEmbed('Insufficient TRX for Fees', `This wallet only holds **${usdt.fromSun(bal.trx)} TRX**. Tron TRC-20 transfers require around 7–25 TRX to cover network energy and bandwidth fees. Please deposit TRX to this address before transferring USDT.`)]
          });
        }

        let secret;
        try {
          secret = usdt.decryptSecret(wallet.secret);
        } catch (err) {
          return interaction.editReply({ embeds: [errorEmbed('Wallet Locked', 'Could not decrypt this wallet. Check `USDT_ENCRYPTION_KEY` in `.env`.')] });
        }

        const preview = createEmbed({
          title: 'Confirm USDT Send',
          description: `From **${wallet.name}**\nTo \`${address}\`\n\n**Amount:** ${usdt.fromUnits(amountUnits)} USDT${usdLine(amountUnits, price)}\n**Network:** TRC-20\n**TRX available:** ${usdt.fromSun(bal.trx)} TRX\nEnergy is paid from TRX, up to ${usdt.fromSun(usdt.FEE_LIMIT)} TRX.`,
          footerText: 'This cannot be undone'
        });

        const prefixConfirm = Boolean(interaction.sourceMessage && /\bconfirm\b/i.test(interaction.sourceMessage.content));
        let decision = prefixConfirm ? 'yes' : await waitForSendConfirm(interaction, preview);
        if (decision === 'slash-required' && !prefixConfirm) {
          return interaction.editReply({
            embeds: [warningEmbed('Confirm Send', `This will send **${usdt.fromUnits(amountUnits)} USDT** to \`${address}\`.\nRun the same command again with \`confirm\` at the end, or use \`/usdt send\`.`)],
            components: []
          });
        }
        if (decision === 'timeout') {
          return interaction.editReply({ embeds: [infoEmbed('Send Cancelled', 'Confirmation timed out. Nothing was sent.')], components: [] });
        }
        if (decision !== 'yes') {
          return interaction.editReply({ embeds: [infoEmbed('Send Cancelled', 'No USDT was sent.')], components: [] });
        }

        const sent = await usdt.sendUsdt(secret, wallet.address, address, amountUnits);
        if (sent.error) {
          return interaction.editReply({ embeds: [errorEmbed('Cannot Send', sent.error)], components: [] });
        }
        return interaction.editReply({
          embeds: [successEmbed('USDT Sent', `**From:** ${wallet.name}\n**To:** \`${address}\`\n**Amount:** ${usdt.fromUnits(amountUnits)} USDT\n**Network:** TRC-20\n**Tx:** [${sent.txid.slice(0, 16)}...](${usdt.explorerTx(sent.txid)})`)],
          components: []
        });
      } catch (err) {
        Logger.error('USDT send failed:', err.message);
        return interaction.editReply({
          embeds: [errorEmbed('Send Failed', err.message || 'Could not broadcast this transaction.')],
          components: []
        });
      }
    }

    if (subcommand === 'transactions') {
      await interaction.deferReply();
      const wallet = db.findUsdtWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) return missingWalletReply(interaction);
      try {
        const txs = await usdt.getTransactions(wallet.address);
        if (!txs.length) {
          return interaction.editReply({
            embeds: [infoEmbed('No Transactions', `No USDT history yet for **${wallet.name}**.`)]
          });
        }
        const fields = txs.slice(0, 8).map((tx) => {
          const net = usdt.netForTransfer(tx, wallet.address);
          const sign = net >= 0 ? '+' : '';
          const confirmed = tx.confirmed === false ? 'Pending' : 'Confirmed';
          const txid = tx.transaction_id || tx.txid || '';
          return {
            name: `${sign}${usdt.fromUnits(net)} USDT · ${confirmed}`,
            value: txid ? `[${txid.slice(0, 18)}...](${usdt.explorerTx(txid)})` : 'Unknown tx',
            inline: false
          };
        });
        return interaction.editReply({
          embeds: [createEmbed({
            title: `USDT Transactions - ${wallet.name}`,
            url: usdt.explorerAddress(wallet.address),
            description: `\`${wallet.address}\``,
            fields,
            footerText: 'Sonnies USDT · TRC-20'
          })]
        });
      } catch (err) {
        Logger.error('USDT transactions failed:', err.message);
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', 'Could not load transactions from the Tron network.')] });
      }
    }

    if (subcommand === 'export') {
      const wallet = db.findUsdtWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('No USDT Wallet', 'Create one first with `/usdt create`.')],
          flags: 64
        });
      }
      try {
        const secret = usdt.decryptSecret(wallet.secret);
        return interaction.reply({
          embeds: [warningEmbed('Private Key', `**Wallet:** ${wallet.name}\n**Address:** \`${wallet.address}\`\n**Key:** \`${secret}\`\n\nAnyone with this key can spend the USDT. Import it in TronLink. Do not share it.`)],
          flags: 64
        });
      } catch (err) {
        return interaction.reply({
          embeds: [errorEmbed('Wallet Locked', 'Could not decrypt this wallet. Check `USDT_ENCRYPTION_KEY` in `.env`.')],
          flags: 64
        });
      }
    }

    if (subcommand === 'delete') {
      const wallet = db.findUsdtWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('Wallet Not Found', 'No wallet with that name.')],
          flags: 64
        });
      }
      await interaction.deferReply({ flags: 64 });
      try {
        const info = await usdt.getAddressInfo(wallet.address);
        const bal = usdt.balanceFromInfo(info);
        if (bal.usdt > 0 || bal.trx > 0) {
          return interaction.editReply({
            embeds: [errorEmbed('Wallet Not Empty', `**${wallet.name}** still holds ${usdt.fromUnits(bal.usdt)} USDT and ${usdt.fromSun(bal.trx)} TRX. Send it out before deleting.`)]
          });
        }
      } catch (err) {
        return interaction.editReply({
          embeds: [errorEmbed('Lookup Failed', 'Could not verify the wallet is empty. Try again.')]
        });
      }
      db.removeUsdtWallet(userId, wallet.id);
      return interaction.editReply({
        embeds: [successEmbed('Wallet Deleted', `Removed **${wallet.name}** (\`${wallet.address}\`).`)]
      });
    }
  }
};
