import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as crypto from 'crypto';

const USERS_COLLECTION = 'users';

@Injectable()
export class PinService {
  constructor(private firebaseService: FirebaseService) {}

  private hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  async hasPin(chatId: string): Promise<boolean> {
    const user = await this.firebaseService.getDoc<any>(USERS_COLLECTION, chatId);
    return !!user?.hashedPin;
  }

  async setPin(chatId: string, pin: string): Promise<void> {
    await this.firebaseService.setDoc(USERS_COLLECTION, chatId, {
      hashedPin: this.hashPin(pin),
      updatedAt: Date.now(),
    });
  }

  async verifyPin(chatId: string, pin: string): Promise<boolean> {
    const user = await this.firebaseService.getDoc<any>(USERS_COLLECTION, chatId);
    if (!user?.hashedPin) return false;
    return user.hashedPin === this.hashPin(pin);
  }
}