import { Logger } from '@nestjs/common';
import { Update, Start, Command, Ctx, On } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { WalletService } from '../wallet/wallet.service';
import { PinService } from '../pin/pin.service';
import {
  Transaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

type SessionStep =
  | 'awaiting_old_pin'
  | 'awaiting_new_pin'
  | 'awaiting_confirm_pin'
  | 'awaiting_send_pin';

interface UserSession {
  step: SessionStep;
  newPin?: string;
  // for send_sol flow
  walletId?: string;
  toAddress?: string;
  amount?: number;
}

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);
  private sessions = new Map<string, UserSession>();

  constructor(
    private walletService: WalletService,
    private pinService: PinService,
    @InjectBot() private bot: Telegraf,
  ) {
    this.registerCommands();
  }

  private async registerCommands() {
    await this.bot.telegram.setMyCommands([
      { command: 'start', description: 'Welcome message' },
      { command: 'help', description: 'List all commands' },
      { command: 'create_wallet', description: 'Create a new Solana wallet' },
      { command: 'wallets', description: 'List your wallets' },
      { command: 'balance', description: 'Check wallet balance' },
      { command: 'send_sol', description: 'Send SOL to an address' },
      { command: 'rename', description: 'Rename a wallet' },
      { command: 'remove', description: 'Remove a wallet' },
      { command: 'set_pin', description: 'Set or change your transaction PIN' },
    ]);
  }

  // ── /start ───────────────────────────────────────────────────────────────────

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const name = ctx.from?.first_name ?? 'there';
    await ctx.reply(
      `👋 Hey ${name}! Welcome to your Solana Wallet Bot.\n\n` +
      `I can help you manage Solana wallets and send SOL — all from Telegram.\n\n` +
      `Type /help to see all available commands.`,
    );
  }

  // ── /help ────────────────────────────────────────────────────────────────────

  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      `🛠 Available Commands\n\n` +
      `👛 Wallets:\n` +
      `/create_wallet <name> — Create a new wallet\n` +
      `/wallets — List all your wallets\n` +
      `/balance <wallet_id> — Check SOL balance\n` +
      `/rename <wallet_id> <new_name> — Rename a wallet\n` +
      `/remove <wallet_id> — Remove a wallet\n\n` +
      `💸 Transactions:\n` +
      `/send_sol <wallet_id> <to_address> <amount> — Send SOL\n\n` +
      `🔐 Security:\n` +
      `/set_pin — Set or change your transaction PIN\n\n` +
      `⚠️ Your private keys are encrypted and stored securely.`,
    );
  }

  // ── /create_wallet ───────────────────────────────────────────────────────────

  @Command('create_wallet')
  async onCreateWallet(@Ctx() ctx: Context) {
    const chatId = String(ctx.chat.id);
    const text = (ctx.message as any)?.text ?? '';
    const name = text.trim().split(/\s+/).slice(1).join(' ');

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
  `Save your Wallet ID — you'll need it for transactions.\n\n` +
  `⚠️ Important Warnings:\n` +
  `• Transactions cannot be undone\n` +
  `• If you send to a wrong address, funds are gone forever\n` +
  `• If you lose your encryption key or PIN, wallets are unrecoverable`,
);
    } catch (err) {
      this.logger.error('create_wallet error', err);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  }

  // ── /wallets ─────────────────────────────────────────────────────────────────

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

  // ── /balance ─────────────────────────────────────────────────────────────────

  @Command('balance')
  async onBalance(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const walletId = text.trim().split(/\s+/)[1];

    if (!walletId) return ctx.reply('Usage: /balance <wallet_id>');

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

  // ── /rename ──────────────────────────────────────────────────────────────────

  @Command('rename')
  async onRename(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const parts = text.trim().split(/\s+/);
    const walletId = parts[1];
    const newName = parts.slice(2).join(' ');

    if (!walletId || !newName) return ctx.reply('Usage: /rename <wallet_id> <new_name>');

    try {
      const wallet = await this.walletService.getWalletById(walletId);
      if (!wallet) return ctx.reply('❌ Wallet not found.');

      await this.walletService.renameWallet(walletId, newName);
      await ctx.reply(`✅ Wallet renamed to "${newName}"`);
    } catch (err) {
      this.logger.error('rename error', err);
      await ctx.reply('❌ Could not rename wallet.');
    }
  }

  // ── /remove ──────────────────────────────────────────────────────────────────

  @Command('remove')
  async onRemove(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const walletId = text.trim().split(/\s+/)[1];

    if (!walletId) return ctx.reply('Usage: /remove <wallet_id>');

    try {
      const wallet = await this.walletService.getWalletById(walletId);
      if (!wallet) return ctx.reply('❌ Wallet not found.');

      await this.walletService.removeWallet(walletId);
      await ctx.reply(
        `🗑 Wallet "${wallet.name}" removed.\n\nNote: This does not delete the wallet on Solana.`,
      );
    } catch (err) {
      this.logger.error('remove error', err);
      await ctx.reply('❌ Could not remove wallet.');
    }
  }

  // ── /set_pin ─────────────────────────────────────────────────────────────────

  @Command('set_pin')
  async onSetPin(@Ctx() ctx: Context) {
    const chatId = String(ctx.chat.id);
    const hasPinAlready = await this.pinService.hasPin(chatId);

    if (hasPinAlready) {
      this.sessions.set(chatId, { step: 'awaiting_old_pin' });
      await ctx.reply(
        `🔐 Enter your current PIN to continue:\n\n` +
        `⚠️ Warning: If you forget your PIN, it cannot be recovered. There is no reset option.`,
      );
    } else {
      this.sessions.set(chatId, { step: 'awaiting_new_pin' });
      await ctx.reply(
        `🔐 Set a new transaction PIN.\n\n` +
        `Enter a PIN (numbers only, min 4 digits):\n\n` +
        `⚠️ Warning: If you lose or forget your PIN, it cannot be recovered. There is no reset option. Store it somewhere safe.`,
      );
    }
  }

  // ── /send_sol ────────────────────────────────────────────────────────────────

  @Command('send_sol')
  async onSendSol(@Ctx() ctx: Context) {
    const chatId = String(ctx.chat.id);
    const text = (ctx.message as any)?.text ?? '';
    const parts = text.trim().split(/\s+/);
    const walletId = parts[1];
    const toAddress = parts[2];
    const amount = parseFloat(parts[3]);

    if (!walletId || !toAddress || isNaN(amount) || amount <= 0) {
      return ctx.reply(
        '❌ Invalid usage.\n\nUsage: /send_sol <wallet_id> <to_address> <amount>\n\nExample:\n/send_sol 4dUAPLipa9Id... 6n1Dyb3Si... 0.1',
      );
    }

    try {
      new PublicKey(toAddress);
    } catch {
      return ctx.reply('❌ Invalid destination address.');
    }

    const hasPinAlready = await this.pinService.hasPin(chatId);
    if (!hasPinAlready) {
      return ctx.reply(
        '❌ You need to set a PIN before sending.\n\nUse /set_pin to create one.',
      );
    }

    // Store pending transaction in session and ask for PIN
    this.sessions.set(chatId, {
      step: 'awaiting_send_pin',
      walletId,
      toAddress,
      amount,
    });

    await ctx.reply(`🔐 Enter your PIN to confirm sending ${amount} SOL:`);
  }

  // ── Text handler (handles all multi-step flows) ───────────────────────────────

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    if (text.startsWith('/')) return;

    const chatId = String(ctx.chat.id);
    const session = this.sessions.get(chatId);

    if (!session) {
      return ctx.reply("I didn't understand that. Type /help to see available commands.");
    }

    // ── set_pin flow ──────────────────────────────────────────────────────────

    if (session.step === 'awaiting_old_pin') {
      const valid = await this.pinService.verifyPin(chatId, text.trim());
      if (!valid) {
        this.sessions.delete(chatId);
        return ctx.reply('❌ Incorrect PIN. Please start again with /set_pin');
      }
      this.sessions.set(chatId, { step: 'awaiting_new_pin' });
      return ctx.reply('✅ PIN verified.\n\nEnter your new PIN (numbers only, min 4 digits):');
    }

    if (session.step === 'awaiting_new_pin') {
      if (!/^\d{4,}$/.test(text.trim())) {
        return ctx.reply('❌ PIN must be numbers only, minimum 4 digits. Try again:');
      }
      this.sessions.set(chatId, { step: 'awaiting_confirm_pin', newPin: text.trim() });
      return ctx.reply('🔁 Confirm your new PIN by entering it again:');
    }

    if (session.step === 'awaiting_confirm_pin') {
      if (text.trim() !== session.newPin) {
        this.sessions.delete(chatId);
        return ctx.reply("❌ PINs don't match. Please start again with /set_pin");
      }
      await this.pinService.setPin(chatId, session.newPin);
      this.sessions.delete(chatId);
      return ctx.reply(
        '✅ PIN set successfully!\n\n' +
        '⚠️ Remember: If you lose or forget your PIN, it cannot be recovered.',
      );
    }

    // ── send_sol PIN verification flow ────────────────────────────────────────

    if (session.step === 'awaiting_send_pin') {
      const valid = await this.pinService.verifyPin(chatId, text.trim());
      if (!valid) {
        this.sessions.delete(chatId);
        return ctx.reply('❌ Incorrect PIN. Transaction cancelled.');
      }

      this.sessions.delete(chatId);
      await ctx.reply('⏳ Processing transaction...');

      try {
        const wallet = await this.walletService.getWalletById(session.walletId);
        if (!wallet) return ctx.reply('❌ Wallet not found.');

        const balance = await this.walletService.getSolBalance(wallet.publicKey);
        if (balance < session.amount) {
          return ctx.reply(
            `❌ Insufficient balance.\n\nAvailable: ${balance.toFixed(6)} SOL\nRequested: ${session.amount} SOL`,
          );
        }

        const keypair = this.walletService.getKeypairFromRecord(wallet);
        const connection = this.walletService.getConnection();

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(session.toAddress),
            lamports: Math.round(session.amount * LAMPORTS_PER_SOL),
          }),
        );

        const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

        await ctx.reply(
          `✅ Transaction sent!\n\n` +
          `📤 From: ${wallet.name}\n` +
          `📥 To: ${session.toAddress}\n` +
          `💸 Amount: ${session.amount} SOL\n\n` +
          `🔗 Signature:\n${signature}\n\n` +
          `View on explorer:\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet`,
        );
      } catch (err) {
        this.logger.error('send_sol error', err);
        await ctx.reply('❌ Transaction failed. Please try again.');
      }
    }
  }
}