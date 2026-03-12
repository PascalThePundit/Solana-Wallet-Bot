import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firestore: admin.firestore.Firestore;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const firebaseConfig = this.configService.get('firebase');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseConfig.projectId,
          clientEmail: firebaseConfig.clientEmail,
          privateKey: firebaseConfig.privateKey,
        }),
      });
    }
    this.firestore = admin.firestore();
    this.logger.log('Firebase initialized');
  }

  async getDoc<T>(collection: string, id: string): Promise<T | null> {
    const doc = await this.firestore.collection(collection).doc(id).get();
    return doc.exists ? (doc.data() as T) : null;
  }

  async setDoc(collection: string, id: string, data: any): Promise<void> {
    await this.firestore.collection(collection).doc(id).set(data, { merge: true });
  }

  async addDoc(collection: string, data: any): Promise<string> {
    const res = await this.firestore.collection(collection).add(data);
    return res.id;
  }

  async queryDocs<T>(collection: string, field: string, value: any): Promise<T[]> {
    const snapshot = await this.firestore.collection(collection).where(field, '==', value).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));
  }

  async deleteDoc(collection: string, id: string): Promise<void> {
    await this.firestore.collection(collection).doc(id).delete();
  }
}