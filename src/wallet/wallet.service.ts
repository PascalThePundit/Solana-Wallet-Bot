import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as bs58 from 'bs58';
import { FirebaseService } from '../firebase/firebase.service';

export interface WalletRecord {
  id?: string;
  chatId: number;
  name: string;
  publicKey: string;
  encryptedPrivateKey: string;
  createdAt: string;
}

@Injectable()
export class WalletService {
  private connection: Connection;
  private readonly encryptionKey: Buffer;
  private readonly COLLECTION = 'wallets';

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    const rpcUrl = this.configService.get<string>('solana.rpcUrl');
    this.connection = new Connection(rpcUrl, 'confirmed');
    const key = this.configService.get<string>('encryption.key');
    this.encryptionKey = Buffer.from(key, 'utf8');
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
  }

  private decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async createWallet(chatId: number, name: string): Promise<WalletRecord> {
    const keypair = Keypair.generate();
    const privateKey = bs58.encode(keypair.secretKey);
    const encryptedPrivateKey = this.encrypt(privateKey);
    const publicKey = keypair.publicKey.toBase58();

    const walletData: WalletRecord = {
      chatId,
      name,
      publicKey,
      encryptedPrivateKey,
      createdAt: new Date().toISOString(),
    };

    const id = await this.firebaseService.addDoc(this.COLLECTION, walletData);
    return { id, ...walletData };
  }

  async getWallets(chatId: number): Promise<WalletRecord[]> {
    return this.firebaseService.queryDocs<WalletRecord>(this.COLLECTION, 'chatId', '==', chatId);
  }

  async getWalletById(id: string): Promise<WalletRecord | null> {
    return this.firebaseService.getDoc<WalletRecord>(this.COLLECTION, id);
  }

  async renameWallet(id: string, newName: string): Promise<void> {
    await this.firebaseService.setDoc(this.COLLECTION, id, { name: newName });
  }

  async removeWallet(id: string): Promise<void> {
    await this.firebaseService.deleteDoc(this.COLLECTION, id);
  }

  getKeypairFromRecord(record: WalletRecord): Keypair {
    const privateKey = this.decrypt(record.encryptedPrivateKey);
    const secretKey = bs58.decode(privateKey);
    return Keypair.fromSecretKey(secretKey);
  }

  async getSolBalance(publicKeyStr: string): Promise<number> {
    const publicKey = new PublicKey(publicKeyStr);
    const balance = await this.connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  }
}
