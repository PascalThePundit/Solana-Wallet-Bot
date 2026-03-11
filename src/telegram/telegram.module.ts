import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [TelegramUpdate],
})
export class TelegramModule {}
