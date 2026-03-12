import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import configuration from './common/config/configuration';
import { FirebaseModule } from './firebase/firebase.module';
import { WalletModule } from './wallet/wallet.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('telegram.botToken'),
      }),
      inject: [ConfigService],
    }),
    FirebaseModule,
    WalletModule,
    TelegramModule,
  ],
})
export class AppModule {}