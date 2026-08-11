import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EVENT_BUS } from "./event-bus.interface";
import { InMemoryEventBusAdapter } from "./in-memory-event-bus.adapter";

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EVENT_BUS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>("eventBus.driver", "memory");
        if (driver !== "memory") {
          // El adaptador SNS/SQS se implementa en la Fase 2 una vez desplegada
          // la infraestructura de infra/cdk contra las cuentas AWS del cliente.
          throw new Error(
            `Adaptador de bus de eventos "${driver}" aun no implementado en el esqueleto de la Fase 1.`,
          );
        }
        return new InMemoryEventBusAdapter();
      },
    },
  ],
  exports: [EVENT_BUS],
})
export class EventsModule {}
