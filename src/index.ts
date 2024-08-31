/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
// 	async fetch(request, env, ctx): Promise<Response> {
// 		return new Response('Hello World!');
// 	},
// } satisfies ExportedHandler<Env>;
import { Hono } from 'hono';
import { DiscordService } from './DiscordService';
import { GithubService } from './GithubService';

const app = new Hono();
const discordService = new DiscordService();
const gitHubService = new GithubService(discordService.userSettings, discordService.pendingAuths);

app.get('/github/callback', async (c) => {
  const { code, state } = c.req.query;

  try {
    const message = await gitHubService.handleAuthCallback(code as string, state as string);
    c.text(message);
  } catch (error) {
    c.text(error.message, 500);
  }
});

app.post('/webhook', async (c) => {
  const signature = c.req.headers['x-hub-signature-256'] as string;

  if (!gitHubService.validateWebhookSignature(c.req.body, signature, process.env.GITHUB_WEBHOOK_SECRET as string)) {
    return c.text('Unauthorized', 401);
  }

  const payload = c.req.body;

  if (payload.action === 'opened' && payload.pull_request) {
    await discordService.notifyPullRequestOpened(payload);
  }

  c.text('OK');
});

discordService.login(process.env.DISCORD_TOKEN as string);

export default app;
