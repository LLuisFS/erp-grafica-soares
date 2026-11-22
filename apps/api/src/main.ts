import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Inicializa a aplicação NestJS (`AppModule`), habilita CORS com credenciais para o `@soares/web`,
 * publica o Swagger em `/docs` com Bearer JWT e inicia o servidor HTTP em `API_PORT` (padrão 3333).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP Gráfica Soares — API')
    .setDescription('API REST interna, CRM fiscal, WhatsApp omnichannel e produção')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT || 3333);
  await app.listen(port);
  console.log(`API ERP Gráfica Soares rodando em http://localhost:${port}`);
  console.log(`Documentação Swagger disponível em http://localhost:${port}/docs`);
}

bootstrap();