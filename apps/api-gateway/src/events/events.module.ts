import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisModule } from "../redis/redis.module";
import { EVENT_BUS } from "./event-bus.interface";
import { InMemoryEventBusAdapter } from "./in-memory-event-bus.adapter";
import { SnsSqsEventBusAdapter } from "./sns-sqs-event-bus.adapter";
import { IdempotencyService } from "./idempotency.service";

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    IdempotencyService,
    {
      provide: EVENT_BUS,
      inject: [ConfigService, IdempotencyService],
      useFactory: (config: ConfigService, idempotency: IdempotencyService) => {
        const driver = config.get<string>("eventBus.driver", "memory");

        if (driver === "memory") {
          return new InMemoryEventBusAdapter();
        }

        if (driver === "sns-sqs") {
          const topicArn = config.get<string>("eventBus.topicArn");
          if (!topicArn) {
            // Fallar al arrancar es preferible a arrancar publicando al vacio.
            throw new Error(
              'EVENT_BUS_DRIVER=sns-sqs requiere EVENT_BUS_TOPIC_ARN.',
            );
          }
          return new SnsSqsEventBusAdapter(
            {
              region: config.get<string>("aws.region", "us-east-1"),
              topicArn,
              queueUrl: config.get<string>("eventBus.queueUrl"),
              endpoint: config.get<string>("aws.endpoint"),
            },
            idempotency,
          );
        }

        throw new Error(`Adaptador de bus de eventos desconocido: "${driver}".`);
      },
    },
  ],
  exports: [EVENT_BUS, IdempotencyService],
})
export class EventsModule {}
