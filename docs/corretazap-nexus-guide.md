# Corretazap Nexus — Guia de Criação e Operação

Este documento descreve, passo a passo, como criar e operar um aplicativo web inspirado no WhatsApp Web para uma corretora de seguros. O app será construído com **Next.js 14** (React 18) e estilização por **shadcn/ui**, consumindo a API em produção exposta por este repositório.

> ⚠️ Conforme solicitado, o código-fonte do aplicativo **não deve** ser versionado neste repositório. Crie um novo repositório Git dedicado ao projeto e siga as instruções abaixo.

## 1. Visão geral do projeto
- **Nome do app**: `corretazap-nexus`
- **Objetivo**: painel interno de atendimento que replica o fluxo de conversas do WhatsApp Web para operadores da corretora e oferece ferramentas de gestão de sessão da API Baileys.
- **Principais funcionalidades**:
  - Interface de chat com conversas, lista de contatos e painel de mensagens com entrega/erro.
  - Painel de gestão da sessão (status, QR/pairing code, iniciar/parar conexão).
  - Envio de mensagens de texto e anexos simples.
  - Histórico básico das sessões e logs de eventos críticos.

## 2. Preparação do ambiente local
1. **Criar repositório** (substitua `<sua-org>`):
   ```bash
   mkdir corretazap-nexus && cd corretazap-nexus
   git init
   git remote add origin git@github.com:<sua-org>/corretazap-nexus.git
   ```
2. **Criar app Next.js** (com TypeScript, Tailwind, App Router):
   ```bash
   npx create-next-app@latest . \
     --typescript \
     --tailwind \
     --eslint \
     --src-dir \
     --app \
     --no-experimental-app \
     --import-alias "@/*"
   ```
3. **Instalar dependências adicionais**:
   ```bash
   npm install @tanstack/react-query axios date-fns jotai lucide-react
   ```
4. **Adicionar shadcn/ui**:
   ```bash
   npx shadcn@latest init
   ```
   - Escolha `tailwindcss` como utilitário de estilização.
   - Habilite alias `@/components` se solicitado.

## 3. Integração com shadcn/ui
1. Adicione os componentes necessários:
   ```bash
   npx shadcn@latest add button card dialog dropdown-menu form input label scroll-area select separator skeleton sonner switch textarea toast tooltip
   ```
2. Crie uma camada de design system em `src/components/ui/` reexportando os componentes adicionados para padronizar importações.

## 4. Variáveis de ambiente e configuração
Crie `./.env.local` (não versionar) com as URLs da API e token de autenticação:
```env
NEXT_PUBLIC_BAILEYS_API_URL=https://baileys.conversaexpress.com.br
BAILEYS_ADMIN_TOKEN=seu_token_aqui
```

Em `next.config.js`, exponha `NEXT_PUBLIC_BAILEYS_API_URL` via `env` se preferir configuração estática.

## 5. Estrutura recomendada de pastas
```
src/
  app/
    layout.tsx
    page.tsx
    chat/
      layout.tsx
      page.tsx
    admin/
      page.tsx
  components/
    chat/
      chat-shell.tsx
      contact-list.tsx
      conversation-header.tsx
      message-bubble.tsx
      message-composer.tsx
    admin/
      connection-card.tsx
      pairing-manager.tsx
      session-log.tsx
    data/
      use-chat-store.ts
    ui/
      ... (reexports shadcn)
  lib/
    api-client.ts
    baileys-types.ts
    formatters.ts
  providers/
    query-provider.tsx
```

## 6. Cliente HTTP e camadas de dados
1. **Cliente Axios** em `src/lib/api-client.ts`:
   ```ts
   import axios from 'axios'

   const api = axios.create({
     baseURL: process.env.NEXT_PUBLIC_BAILEYS_API_URL,
     headers: {
       Authorization: `Bearer ${process.env.BAILEYS_ADMIN_TOKEN ?? ''}`,
     },
   })

   export default api
   ```
2. **Definir tipos** em `src/lib/baileys-types.ts` baseado nos endpoints:
   ```ts
   export interface ConnectionStatus {
     qr?: string | null
     pairingCode?: string | null
     connection?: {
       state: 'open' | 'connecting' | 'close' | 'unknown'
       lastDisconnect?: string
     }
   }

   export interface SendMessagePayload {
     jid: string
     message: string
   }
   ```
3. **Hooks React Query** (`src/components/data/use-chat-store.ts`):
   - `useConnectionStatus()` → `GET /status`
   - `useStartConnection()` → `POST /connect`
   - `useRequestPairingCode()` → `POST /pair-code`
   - `useSendMessage()` → `POST /send`
   - Criar polling com `refetchInterval` de 5000 ms para manter status atualizado.

> Sempre verifique se já existe função/utilitário com a mesma responsabilidade antes de criar um novo; remova imediatamente código morto ou duplicado para manter o repositório limpo.

## 7. Interface de Chat
1. **Layout base** (`src/app/chat/layout.tsx`): dividir a página em duas colunas usando `flex` (lista de contatos + painel de conversa).
2. **Lista de contatos** (`contact-list.tsx`):
   - Usa `ScrollArea` do shadcn.
   - Mostra avatar, nome, snippet da última mensagem.
   - Integra com store (ex.: Jotai) para controlar `selectedChatId`.
3. **Painel de mensagens** (`chat-shell.tsx` + `message-bubble.tsx`):
   - Renderiza mensagens vindas da API da VPS (você pode criar um endpoint proxy, ex.: `GET /messages?jid=<id>` se estiver disponível). Caso não exista, mantenha estado local com dados mock enquanto API é estendida.
   - Oferece estados de carregamento com `Skeleton`.
   - Diferenciar mensagens enviadas/recebidas com classes utilitárias Tailwind e tokens do tema shadcn.
4. **Composer** (`message-composer.tsx`):
   - Formulário com `Textarea`, anexos opcionais e botão `Enviar`.
   - Usa hook `useSendMessage` com feedback via `toast` (Sonner).

## 8. Painel de Gestão de Conexão
1. Página `src/app/admin/page.tsx`:
   - Cards com status atual (`connection-card.tsx`) exibindo QR e pairing code via `Dialog` ou `Sheet`.
   - Botões "Iniciar conexão"/"Forçar reconexão" usando `useStartConnection`.
2. **Pairing Manager**:
   - Formulário para enviar número `POST /pair-code`.
   - Exibe código recebido e fornece opção de copiar.
3. **Logs de sessão**:
   - Consumir (ou mockar) `/status` e mostrar últimos eventos (ex.: `connection.lastDisconnect`).
   - Adicionar tabela com data/hora formatada via `date-fns`.

## 9. Persistência de dados de interface
- Utilize `localStorage` (com verificação client-side) para armazenar chats recentes até que endpoints dedicados sejam disponibilizados.
- Abstraia acesso em helpers (`src/lib/storage.ts`) e limpe implementações obsoletas quando endpoints oficiais forem liberados.

## 10. Fluxo de desenvolvimento
1. **Rodar lint/testes**:
   ```bash
   npm run lint
   npm run test # configure Jest ou Vitest conforme necessidade
   ```
2. **Rodar ambiente local**:
   ```bash
   npm run dev
   ```
   - Certifique-se de que a máquina consegue alcançar `https://baileys.conversaexpress.com.br`.
3. **Commits**: siga Conventional Commits (`feat: ...`, `fix: ...`). Remova arquivos gerados automaticamente não utilizados.

## 11. Deploy
1. Configurar pipeline (Vercel recomendado para Next.js):
   - Variáveis de ambiente: `NEXT_PUBLIC_BAILEYS_API_URL`, `BAILEYS_ADMIN_TOKEN`.
   - Adicione script de build padrão (`next build`).
2. Alternativa self-hosted: gerar build estática + Node server (`next start`) atrás de Nginx.
3. Monitore logs e limpe recursos não utilizados no servidor para cumprir a diretriz de remover elementos redundantes.

## 12. Documentação do uso
- Crie um `README.md` no novo repositório com:
  - Requisitos, passos de instalação, comandos de execução e deploy.
  - Fluxo operacional (como iniciar sessão, solicitar pairing code, enviar mensagem).
  - Checklist de manutenção (backup de `baileys_auth_info`, rotação de tokens, remoção periódica de código morto).
- Gere vídeos/gifs curtos demonstrando conexão e fluxo de mensagens para treinamento interno.

Seguindo este guia, você terá um painel moderno, alinhado ao estilo do WhatsApp Web, integrado com a API Baileys em produção, mantendo rastreabilidade e higiene de código ao remover componentes que se tornarem obsoletos.
