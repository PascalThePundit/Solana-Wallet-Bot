import { Logger } from '@nestjs/common';
import { Update, Start, Command, Ctx, On } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { WalletService } from '../wallet/wallet.service';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(private walletService: WalletService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const name = ctx.from?.first_name ?? 'there';
    await ctx.reply(
      `👋 Hey ${name}! Welcome to your Solana Wallet Bot.\n\n` +
      `I can help you manage Solana wallets and send SOL, USDC, and USDT — all from Telegram.\n\n` +
      `Type /help to see what I can do.`,
    );
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      `🛠 Available Commands\n\n` +
      `Wallets:\n` +
      `/create_wallet <name> — Create a new Solana wallet\n` +
      `/wallets — List all your wallets\n` +
      `/balance <wallet_id> — Check SOL balance\n` +
      `/rename <wallet_id> <new_name> — Rename a wallet\n` +
      `/remove <wallet_id> — Remove a wallet from the bot\n\n` +
      `Transactions:\n` +
      `/send_sol <wallet_id> <to_address> <amount> — Send SOL\n` +
      `More coming soon: USDC, USDT transfers\n\n` +
      `⚠️ Your private keys are encrypted and stored securely. The bot never exposes them.`,
    );
  }

  @Command('create_wallet')
  async onCreateWallet(@Ctx() ctx: Context) {
    const chatId = String(ctx.chat.id);
    const text = (ctx.message as any)?.text ?? '';
    const parts = text.trim().split(/\s+/);
    const name = parts.slice(1).join(' ');

    if (!name) {
      return ctx.reply('❌ Please provide a name.\n\nUsage: /create_wallet <name>');
    }

    await ctx.reply('⏳ Creating wallet...');

    try {
      const wallet = await this.walletService.createWallet(chatId, name);
      await ctx.reply(
        `✅ Wallet created!\n\n` +
        `📛 Name: ${wallet.name}\n` +
        `🔑 Public Key:\n${wallet.publicKey}\n\n` +
        `🆔 Wallet ID: ${wallet.id}\n\n` +
        `Save your Wallet ID — you'll need it for transactions and lookups.`,
      );
    } catch (err) {
      this.logger.error('create_wallet error', err);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  }

  @Command('wallets')
  async onWallets(@Ctx() ctx: Context) {
    const chatId = String(ctx.chat.id);

    try {
      const wallets = await this.walletService.getWallets(chatId);

      if (!wallets.length) {
        return ctx.reply('You have no wallets yet. Use /create_wallet <name> to get started.');
      }

      const lines = wallets.map((w, i) =>
        `${i + 1}. ${w.name}\n   🔑 ${w.publicKey}\n   🆔 ${w.id}`,
      );

      await ctx.reply(`👛 Your Wallets\n\n${lines.join('\n\n')}`);
    } catch (err) {
      this.logger.error('wallets error', err);
      await ctx.reply('❌ Could not fetch wallets. Please try again.');
    }
  }

  @Command('balance')
  async onBalance(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const parts = text.trim().split(/\s+/);
    const walletId = parts[1];

    if (!walletId) {
      return ctx.reply('Usage: /balance <wallet_id>');
    }

    try {
      const wallet = await this.walletService.getWalletById(walletId);
      if (!wallet) return ctx.reply('❌ Wallet not found.');

      const sol = await this.walletService.getSolBalance(wallet.publicKey);
      await ctx.reply(`💰 Balance for ${wallet.name}\n\nSOL: ${sol.toFixed(6)}`);
    } catch (err) {
      this.logger.error('balance error', err);
      await ctx.reply('❌ Could not fetch balance. Please try again.');
    }
  }

  @Command('rename')
  async onRename(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const parts = text.trim().split(/\s+/);
    const walletId = parts[1];
    const newName = parts.slice(2).join(' ');

    if (!walletId || !newName) {
      return ctx.reply('Usage: /rename <wallet_id> <new_name>');
    }

    try {
      const wallet = await this.walletService.getWalletById(walletId);
      if (!wallet) return ctx.reply('❌ Wallet not found.');

      await this.walletService.renameWallet(walletId, newName);
      await ctx.reply(`✅ Wallet renamed to ${newName}`);
    } catch (err) {
      this.logger.error('rename error', err);
      await ctx.reply('❌ Could not rename wallet.');
    }
  }

  @Command('remove')
  async onRemove(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const walletId = text.trim().split(/\s+/)[1];

    if (!walletId) {
      return ctx.reply('Usage: /remove <wallet_id>');
    }

    try {
      const wallet = await this.walletService.getWalletById(walletId);
      if (!wallet) return ctx.reply('❌ Wallet not found.');

      await this.walletService.removeWallet(walletId);
      await ctx.reply(`🗑 Wallet "${wallet.name}" removed from the bot.\n\nNote: This does not delete the wallet on Solana.`);
    } catch (err) {
      this.logger.error('remove error', err);
      await ctx.reply('❌ Could not remove wallet.');
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    await ctx.reply("I didn't understand that. Type /help to see available commands.");
  }
}