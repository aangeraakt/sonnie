const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed, warningEmbed, infoEmbed } = require('../../utils/embedBuilder');
const ltc = require('../../utils/ltcWallet');
const Logger = require('../../utils/logger');

function walletOrReply(interaction, name) {
  const wallet = db.findLtcWallet(interaction.user.id, name);
  if (wallet) return wallet;
  return null;
}

function missingWalletReply(interaction) {
  return interaction.editReply({
    embeds: [errorEmbed('No LTC Wallet', 'Create one first with `/ltc create`.')]
  });
}

function usdLine(sats, price) {
  if (!price) return '';
  return ` (~$${(sats / ltc.SATS * price).toFixed(2)})`;
}

async function waitForSendConfirm(interaction, embed) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ltc_send_yes').setLabel('Send LTC').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ltc_send_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  const message = await interaction.editReply({ embeds: [embed], components: [row] });
  if (!message || typeof message.awaitMessageComponent !== 'function') return 'slash-required';
  try {
    const clicked = await message.awaitMessageComponent({
      filter: (btn) => btn.user.id === interaction.user.id && (btn.customId === 'ltc_send_yes' || btn.customId === 'ltc_send_no'),
      time: 60000
    });
    await clicked.deferUpdate().catch(() => {});
    return clicked.customId === 'ltc_send_yes' ? 'yes' : 'no';
  } catch (err) {
    return 'timeout';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ltc')
    .setDescription('Litecoin wallets, send, receive, and transactions')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new Litecoin wallet')
        .addStringOption(opt => opt.setName('name').setDescription('Wallet name').setRequired(false).setMaxLength(24))
    )
    .addSubcommand(sub =>
      sub
        .setName('wallets')
        .setDescription('List your Litecoin wallets')
    )
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription('Check a Litecoin wallet balance')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('receive')
        .setDescription('Show a deposit address')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('send')
        .setDescription('Send Litecoin to an address')
        .addStringOption(opt => opt.setName('address').setDescription('Destination LTC address').setRequired(true))
        .addNumberOption(opt => opt.setName('amount').setDescription('Amount in LTC').setRequired(true).setMinValue(0.00001))
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet to send from').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('transactions')
        .setDescription('View recent Litecoin transactions')
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
        .setDescription('Delete an empty Litecoin wallet')
        .addStringOption(opt => opt.setName('wallet').setDescription('Wallet name').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (subcommand === 'export' && interaction.sourceMessage) {
      return interaction.reply({
        embeds: [errorEmbed('Use Slash Command', 'Private keys can only be exported with `/ltc export` as a hidden reply.')]
      });
    }

    if (subcommand === 'create') {
      const wallets = db.getLtcWallets(userId);
      if (wallets.length >= ltc.MAX_WALLETS) {
        return interaction.reply({
          embeds: [errorEmbed('Wallet Limit', `You can keep up to ${ltc.MAX_WALLETS} Litecoin wallets.`)],
          flags: 64
        });
      }
      const used = wallets.map((wallet) => wallet.name.toLowerCase());
      const name = ltc.normalizeName(interaction.options.getString('name'), used);
      if (used.includes(name.toLowerCase())) {
        return interaction.reply({
          embeds: [errorEmbed('Name In Use', `You already have a wallet named \`${name}\`.`)],
          flags: 64
        });
      }
      const generated = ltc.createKeypair();
      db.addLtcWallet(userId, {
        id: crypto.randomUUID(),
        name,
        address: generated.address,
        secret: ltc.encryptSecret(generated.wif),
        created_at: new Date().toISOString()
      });
      return interaction.reply({
        embeds: [successEmbed('Litecoin Wallet Created', `**Name:** \`${name}\`\n**Address:** \`${generated.address}\`\n\nShare this address to receive LTC. Keys stay encrypted on the bot.\nView it later with \`/ltc receive\`.`)],
        flags: 64
      });
    }

    if (subcommand === 'wallets') {
      const wallets = db.getLtcWallets(userId);
      if (!wallets.length) {
        return interaction.reply({
          embeds: [infoEmbed('No Wallets', 'You have no Litecoin wallets yet. Use `/ltc create`.')],
          flags: 64
        });
      }
      await interaction.deferReply({ flags: 64 });
      const price = await ltc.getUsdPrice();
      const lines = [];
      for (const wallet of wallets) {
        try {
          const info = await ltc.getAddressInfo(wallet.address);
          const bal = ltc.balanceFromInfo(info);
          lines.push(`**${wallet.name}**\n\`${wallet.address}\`\n${ltc.fromSats(bal.total)} LTC${usdLine(bal.total, price)}`);
        } catch (err) {
          lines.push(`**${wallet.name}**\n\`${wallet.address}\`\nBalance unavailable`);
        }
      }
      return interaction.editReply({
        embeds: [createEmbed({
          title: 'Litecoin Wallets',
          description: lines.join('\n\n'),
          footerText: 'Sonnies LTC'
        })]
      });
    }

    if (subcommand === 'balance') {
      await interaction.deferReply();
      const wallet = walletOrReply(interaction, interaction.options.getString('wallet'));
      if (!wallet) return missingWalletReply(interaction);
      try {
        const [info, price] = await Promise.all([ltc.getAddressInfo(wallet.address), ltc.getUsdPrice()]);
        const bal = ltc.balanceFromInfo(info);
        return interaction.editReply({
          embeds: [createEmbed({
            title: `LTC Balance - ${wallet.name}`,
            url: ltc.explorerAddress(wallet.address),
            description: `\`${wallet.address}\``,
            fields: [
              { name: 'Confirmed', value: `**${ltc.fromSats(bal.confirmed)} LTC**${usdLine(bal.confirmed, price)}`, inline: true },
              { name: 'Pending', value: `**${ltc.fromSats(bal.pending)} LTC**`, inline: true },
              { name: 'Transactions', value: `**${bal.txCount}**`, inline: true }
            ],
            footerText: 'Sonnies LTC'
          })]
        });
      } catch (err) {
        Logger.error('LTC balance failed:', err.message);
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', 'Could not read this wallet from the Litecoin network.')] });
      }
    }

    if (subcommand === 'receive') {
      const wallet = db.findLtcWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('No LTC Wallet', 'Create one first with `/ltc create`.')],
          flags: 64
        });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Receive LTC - ${wallet.name}`,
          description: `Send Litecoin to this address.\n\n\`${wallet.address}\`\n[Open in explorer](${ltc.explorerAddress(wallet.address)})`,
          image: ltc.qrUrl(wallet.address),
          footerText: 'Sonnies LTC'
        })]
      });
    }

    if (subcommand === 'send') {
      const wallet = db.findLtcWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('No LTC Wallet', 'Create one first with `/ltc create`.')],
          flags: 64
        });
      }
      const address = interaction.options.getString('address');
      const amount = interaction.options.getNumber('amount');
      const amountSats = ltc.toSats(amount);
      if (!ltc.isValidAddress(address)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Address', 'That is not a valid Litecoin address.')],
          flags: 64
        });
      }
      if (!amountSats || amountSats < 1000) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Amount', 'Minimum send amount is 0.00001 LTC.')],
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
        const [utxos, satPerVb, price] = await Promise.all([
          ltc.getUtxos(wallet.address),
          ltc.getFeeRate(),
          ltc.getUsdPrice()
        ]);
        let wif;
        try {
          wif = ltc.decryptSecret(wallet.secret);
        } catch (err) {
          return interaction.editReply({ embeds: [errorEmbed('Wallet Locked', 'Could not decrypt this wallet. Check `LTC_ENCRYPTION_KEY` in `.env`.')] });
        }
        const built = ltc.buildSignedTx(wif, wallet.address, address, amountSats, utxos, satPerVb);
        if (built.error) {
          return interaction.editReply({ embeds: [errorEmbed('Cannot Send', built.error)] });
        }

        const preview = createEmbed({
          title: 'Confirm LTC Send',
          description: `From **${wallet.name}**\nTo \`${address}\`\n\n**Amount:** ${ltc.fromSats(amountSats)} LTC${usdLine(amountSats, price)}\n**Network fee:** ${ltc.fromSats(built.fee)} LTC\n**Change back:** ${ltc.fromSats(built.change)} LTC`,
          footerText: 'This cannot be undone'
        });

        const prefixConfirm = Boolean(interaction.sourceMessage && /\bconfirm\b/i.test(interaction.sourceMessage.content));
        let decision = prefixConfirm ? 'yes' : await waitForSendConfirm(interaction, preview);
        if (decision === 'slash-required' && !prefixConfirm) {
          return interaction.editReply({
            embeds: [warningEmbed('Confirm Send', `This will send **${ltc.fromSats(amountSats)} LTC** to \`${address}\`.\nRun the same command again with \`confirm\` at the end, or use \`/ltc send\`.`)],
            components: []
          });
        }
        if (decision === 'timeout') {
          return interaction.editReply({ embeds: [infoEmbed('Send Cancelled', 'Confirmation timed out. Nothing was sent.')], components: [] });
        }
        if (decision !== 'yes') {
          return interaction.editReply({ embeds: [infoEmbed('Send Cancelled', 'No Litecoin was sent.')], components: [] });
        }

        const txid = await ltc.broadcastTx(built.hex);
        return interaction.editReply({
          embeds: [successEmbed('Litecoin Sent', `**From:** ${wallet.name}\n**To:** \`${address}\`\n**Amount:** ${ltc.fromSats(amountSats)} LTC\n**Fee:** ${ltc.fromSats(built.fee)} LTC\n**Tx:** [${txid.slice(0, 16)}...](${ltc.explorerTx(txid)})`)],
          components: []
        });
      } catch (err) {
        Logger.error('LTC send failed:', err.message);
        return interaction.editReply({
          embeds: [errorEmbed('Send Failed', err.message || 'Could not broadcast this transaction.')],
          components: []
        });
      }
    }

    if (subcommand === 'transactions') {
      await interaction.deferReply();
      const wallet = db.findLtcWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) return missingWalletReply(interaction);
      try {
        const txs = await ltc.getTransactions(wallet.address);
        if (!txs.length) {
          return interaction.editReply({
            embeds: [infoEmbed('No Transactions', `No on-chain history yet for **${wallet.name}**.`)]
          });
        }
        const fields = txs.slice(0, 8).map((tx) => {
          const net = ltc.netForAddress(tx, wallet.address);
          const sign = net >= 0 ? '+' : '';
          const status = tx.status?.confirmed ? 'Confirmed' : 'Pending';
          return {
            name: `${sign}${ltc.fromSats(net)} LTC · ${status}`,
            value: `[${tx.txid.slice(0, 18)}...](${ltc.explorerTx(tx.txid)})`,
            inline: false
          };
        });
        return interaction.editReply({
          embeds: [createEmbed({
            title: `LTC Transactions - ${wallet.name}`,
            url: ltc.explorerAddress(wallet.address),
            description: `\`${wallet.address}\``,
            fields,
            footerText: 'Sonnies LTC'
          })]
        });
      } catch (err) {
        Logger.error('LTC transactions failed:', err.message);
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', 'Could not load transactions from the Litecoin network.')] });
      }
    }

    if (subcommand === 'export') {
      const wallet = db.findLtcWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('No LTC Wallet', 'Create one first with `/ltc create`.')],
          flags: 64
        });
      }
      try {
        const wif = ltc.decryptSecret(wallet.secret);
        return interaction.reply({
          embeds: [warningEmbed('Private Key', `**Wallet:** ${wallet.name}\n**Address:** \`${wallet.address}\`\n**WIF:** \`${wif}\`\n\nAnyone with this key can spend the LTC. Do not share it.`)],
          flags: 64
        });
      } catch (err) {
        return interaction.reply({
          embeds: [errorEmbed('Wallet Locked', 'Could not decrypt this wallet. Check `LTC_ENCRYPTION_KEY` in `.env`.')],
          flags: 64
        });
      }
    }

    if (subcommand === 'delete') {
      const wallet = db.findLtcWallet(userId, interaction.options.getString('wallet'));
      if (!wallet) {
        return interaction.reply({
          embeds: [errorEmbed('Wallet Not Found', 'No wallet with that name.')],
          flags: 64
        });
      }
      await interaction.deferReply({ flags: 64 });
      try {
        const info = await ltc.getAddressInfo(wallet.address);
        const bal = ltc.balanceFromInfo(info);
        if (bal.total > 0) {
          return interaction.editReply({
            embeds: [errorEmbed('Wallet Not Empty', `**${wallet.name}** still holds ${ltc.fromSats(bal.total)} LTC. Send it out before deleting.`)]
          });
        }
      } catch (err) {
        return interaction.editReply({
          embeds: [errorEmbed('Lookup Failed', 'Could not verify the wallet is empty. Try again.')]
        });
      }
      db.removeLtcWallet(userId, wallet.id);
      return interaction.editReply({
        embeds: [successEmbed('Wallet Deleted', `Removed **${wallet.name}** (\`${wallet.address}\`).`)]
      });
    }
  }
};
