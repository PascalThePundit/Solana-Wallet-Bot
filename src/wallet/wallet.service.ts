import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as bs58 from 'bs58';

export interface WalletRecord {
  id?: string;
  chatId: string;
  name: string;
  publicKey: string;
  encryptedPrivateKey: string;
  createdAt: number;
}

const WALLETS_COLLECTION = 'wallets';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private connection: Connection;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    const rpcUrl = this.configService.get<string>('solana.rpcUrl');
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private getEncryptionKey(): Buffer {
    const key = this.configService.get<string>('encryption.key');
    if (!key) throw new Error('ENCRYPTION_KEY is not set');
    return Buffer.from(key, 'hex');
  }

  private encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(ciphertext: string): string {
    const key = this.getEncryptionKey();
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  async createWallet(chatId: string, name: string): Promise<WalletRecord> {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const privateKeyBase58 = bs58.encode(keypair.secretKey);
    const encryptedPrivateKey = this.encrypt(privateKeyBase58);

    const record: WalletRecord = {
      chatId,
      name,
      publicKey,
      encryptedPrivateKey,
      createdAt: Date.now(),
    };

    const id = await this.firebaseService.addDoc(WALLETS_COLLECTION, record);
    this.logger.log(`Wallet created for chatId=${chatId} pubkey=${publicKey}`);
    return { ...record, id };
  }

  async getWallets(chatId: string): Promise<WalletRecord[]> {
    return this.firebaseService.queryDocs<WalletRecord>(WALLETS_COLLECTION, 'chatId', chatId);
  }

  async getWalletById(docId: string): Promise<WalletRecord | null> {
    return this.firebaseService.getDoc<WalletRecord>(WALLETS_COLLECTION, docId);
  }

  async renameWallet(docId: string, newName: string): Promise<void> {
    await this.firebaseService.setDoc(WALLETS_COLLECTION, docId, { name: newName });
  }

  async removeWallet(docId: string): Promise<void> {
    await this.firebaseService.deleteDoc(WALLETS_COLLECTION, docId);
  }

  getKeypairFromRecord(record: WalletRecord): Keypair {
    const privateKeyBase58 = this.decrypt(record.encryptedPrivateKey);
    return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  }

  async getSolBalance(publicKey: string): Promise<number> {
    const lamports = await this.connection.getBalance(new PublicKey(publicKey));
    return lamports / LAMPORTS_PER_SOL;
  }

  getConnection(): Connection {
    return this.connection;
  }
}