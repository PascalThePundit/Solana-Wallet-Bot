import { Update, Start, Command, On, Ctx } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { WalletService } from '../wallet/wallet.service';

@Update()
export class TelegramUpdate {
  constructor(private walletService: WalletService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const message = `
*Welcome to Solana Wallet Bot\\!*

Use the following commands to manage your wallets:
/create\\_wallet `<name>` \\- Create a new wallet
/wallets \\- List your wallets
/balance `<wallet_id>` \\- Get SOL balance
/rename `<wallet_id>` `<new_name>` \\- Rename a wallet
/remove `<wallet_id>` \\- Remove a wallet
/help \\- Show this help
    `;
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    await this.onStart(ctx);
  }

  @Command('create_wallet')
  async onCreateWallet(@Ctx() ctx: Context) {
    const text = (ctx.message as any).text;
    const name = text.split(' ').slice(1).join(' ');

    if (!name) {
      return ctx.reply('Please provide a name for the wallet\\. Usage: /create\\_wallet `<name>`', { parse_mode: 'MarkdownV2' });
    }

    try {
      const wallet = await this.walletService.createWallet(ctx.chat.id, name);
      const msg = `
✅ *Wallet Created\\!*
*Name:* ${this.escapeMarkdown(wallet.name)}
*Public Key:* \`${this.escapeMarkdown(wallet.publicKey)}\`
*ID:* \`${this.escapeMarkdown(wallet.id)}\`
      `;
      await ctx.reply(msg, { parse_mode: 'MarkdownV2' });
    } catch (e) {
      await ctx.reply('Error creating wallet\\. Please check your configuration\\.');
    }
  }

  @Command('wallets')
  async onWallets(@Ctx() ctx: Context) {
    const wallets = await this.walletService.getWallets(ctx.chat.id);
    if (wallets.length === 0) {
      return ctx.reply('You have no wallets yet\\. Use /create\\_wallet to get started\\.');
    }

    let msg = '*Your Wallets:*\n\n';
    wallets.forEach((w, i) => {
      msg += `${i + 1}\\. *${this.escapeMarkdown(w.name)}*\n`;
      msg += `   ID: \`${this.escapeMarkdown(w.id)}\`\n`;
      msg += `   Pub: \`${this.escapeMarkdown(w.publicKey)}\`\n\n`;
    });
    await ctx.reply(msg, { parse_mode: 'MarkdownV2' });
  }

  @Command('balance')
  async onBalance(@Ctx() ctx: Context) {
    const text = (ctx.message as any).text;
    const walletId = text.split(' ')[1];

    if (!walletId) {
      return ctx.reply('Usage: /balance `<wallet_id>`', { parse_mode: 'MarkdownV2' });
    }

    const wallet = await this.walletService.getWalletById(walletId);
    if (!wallet || wallet.chatId !== ctx.chat.id) {
      return ctx.reply('Wallet not found or access denied\\.');
    }

    try {
      const balance = await this.walletService.getSolBalance(wallet.publicKey);
      await ctx.reply(`💰 *Balance for ${this.escapeMarkdown(wallet.name)}:*\n${balance} SOL`, { parse_mode: 'MarkdownV2' });
    } catch (e) {
      await ctx.reply('Error fetching balance\\.');
    }
  }

  @Command('rename')
  async onRename(@Ctx() ctx: Context) {
    const text = (ctx.message as any).text;
    const parts = text.split(' ');
    const walletId = parts[1];
    const newName = parts.slice(2).join(' ');

    if (!walletId || !newName) {
      return ctx.reply('Usage: /rename `<wallet_id>` `<new_name>`', { parse_mode: 'MarkdownV2' });
    }

    const wallet = await this.walletService.getWalletById(walletId);
    if (!wallet || wallet.chatId !== ctx.chat.id) {
      return ctx.reply('Wallet not found or access denied\\.');
    }

    await this.walletService.renameWallet(walletId, newName);
    await ctx.reply(`✅ Wallet renamed to *${this.escapeMarkdown(newName)}*`, { parse_mode: 'MarkdownV2' });
  }

  @Command('remove')
  async onRemove(@Ctx() ctx: Context) {
    const text = (ctx.message as any).text;
    const walletId = text.split(' ')[1];

    if (!walletId) {
      return ctx.reply('Usage: /remove `<wallet_id>`', { parse_mode: 'MarkdownV2' });
    }

    const wallet = await this.walletService.getWalletById(walletId);
    if (!wallet || wallet.chatId !== ctx.chat.id) {
      return ctx.reply('Wallet not found or access denied\\.');
    }

    await this.walletService.removeWallet(walletId);
    await ctx.reply('🗑️ Wallet removed successfully\\.', { parse_mode: 'MarkdownV2' });
  }

  @On('text')
  async onMessage(@Ctx() ctx: Context) {
    await ctx.reply('Unknown command\\. Use /help to see available commands\\.');
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}
