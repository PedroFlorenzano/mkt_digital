# Checklist de Produção — MKT Digital Platform

Pendências para subir o projeto em ambiente de produção.

---

## 1. Banco de Dados
- [ ] Migrar de SQLite para PostgreSQL
- [ ] Configurar `DATABASE_URL` com string de conexão PostgreSQL
- [ ] Usar `prisma migrate` em vez de `prisma db push` (criar histórico de migrações)
- [ ] Planejar backup automático do banco

## 2. Infraestrutura / Hosting
- [ ] Escolher onde hospedar (Vercel, AWS ECS, EC2, etc.)
- [ ] Configurar domínio e DNS (ex: `app.seudominio.com`)
- [ ] Configurar HTTPS/SSL (certificado)
- [ ] Definir estratégia de deploy (CI/CD pipeline)

## 3. Autenticação & Segurança
- [ ] Gerar `NEXTAUTH_SECRET` forte para produção
- [ ] Configurar `NEXTAUTH_URL` com o domínio de produção
- [ ] Configurar Google OAuth com redirect URI de produção (se usar)
- [ ] Configurar `CRON_SECRET` forte
- [ ] Gerar `CREDENTIAL_ENCRYPTION_KEY` (64 hex chars)
- [ ] Rate limiting (Redis ou similar) para proteger APIs

## 4. AWS
- [ ] Criar IAM role/user dedicado para produção (em vez de profile local `mktai`)
- [ ] Configurar credenciais AWS via variáveis de ambiente (não profile)
- [ ] Criar bucket S3 para vídeos (`AWS_S3_VIDEO_BUCKET`)
- [ ] Validar acesso ao Bedrock nas regiões `us-east-1` e `us-west-2`
- [ ] Configurar limites de billing/usage no Bedrock

## 5. Email
- [ ] Configurar conta Resend e API key (`RESEND_API_KEY`)
- [ ] Verificar domínio de envio no Resend
- [ ] Configurar `EMAIL_FROM` com domínio verificado

## 6. Build & Testes
- [ ] Corrigir erros de TypeScript restantes (`cost.service.test.ts`)
- [ ] Rodar `npm run build` com sucesso
- [ ] Garantir cobertura de testes mínima
- [ ] Rodar `npm run lint` sem warnings

## 7. Performance & Monitoramento
- [ ] Configurar logging centralizado (CloudWatch, Datadog, etc.)
- [ ] Configurar monitoramento de erros (Sentry ou similar)
- [ ] Configurar health check endpoint
- [ ] Avaliar caching (Redis para sessões, queries frequentes)

## 8. Variáveis de Ambiente
- [ ] Remover qualquer dado de dev do `.env`
- [ ] Configurar todas as variáveis listadas no `.env.example` para produção
- [ ] Garantir que `.env` está no `.gitignore`

## 9. Imagens / Assets
- [ ] Configurar `remotePatterns` no `next.config.ts` para domínios reais usados em produção (S3, etc.)
- [ ] Considerar CDN para assets estáticos

## 10. Funcionalidades pendentes (Roadmap)
- [ ] Upload de imagens para S3 (em vez de local/base64)
- [ ] Sistema de planos e assinaturas (Stripe)
- [ ] Dashboard de métricas das redes sociais
