import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { WalletModule } from '../wallet/wallet.module';
import { PinModule } from '../pin/pin.module';

@Module({
  imports: [WalletModule, PinModule],
  providers: [TelegramUpdate],
})
export class TelegramModule {}