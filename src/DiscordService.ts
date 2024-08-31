import { Client, Message, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import crypto from 'crypto';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN as string;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET as string;

interface UserSetting {
  accessToken: string;
  repos?: Array<{ owner: string; name: string }>;
}

interface GithubWebhookPayload {
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
  sender: {
    login: string;
    avatar_url: string;
  };
  action?: string;
  pull_request?: {
    title: string;
    html_url: string;
  };
}

export class DiscordService {
  private client: Client;
  private userSettings: Map<string, UserSetting>;
  private pendingAuths: Map<string, string>;

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
    this.userSettings = new Map();
    this.pendingAuths = new Map();

    this.client.once('ready', () => {
      console.log('Discord 봇이 준비되었습니다!');
    });

    this.client.on('messageCreate', this.handleMessageCreate.bind(this));
  }

  public login(token: string) {
    this.client.login(token);
  }

  private async handleMessageCreate(message: Message) {
    if (message.author.bot) return;

    if (message.content === '!github 연동') {
      const state = crypto.randomBytes(16).toString('hex');
      this.pendingAuths.set(state, message.author.id);

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI as string)}&scope=repo&state=${state}`;

      const embed = new EmbedBuilder()
        .setTitle('GitHub 계정 연동')
        .setDescription(`[여기를 클릭하여 GitHub 계정을 연동하세요](${authUrl})`)
        .setColor('#0099ff');

      await message.reply({ embeds: [embed] });
    }

    if (message.content.startsWith('!설정')) {
      await this.handleSettingsCommand(message);
    }
  }

  private async handleSettingsCommand(message: Message) {
    const args = message.content.split(' ');
    if (args.length !== 3) {
      await message.reply('사용법: !설정 <GitHub 사용자명> <레포지토리명>');
      return;
    }

    const [, githubUsername, repoName] = args;
    const userSetting = this.userSettings.get(message.author.id);

    if (!userSetting || !userSetting.accessToken) {
      await message.reply('먼저 GitHub 계정을 연동해주세요. (!github 연동)');
      return;
    }

    try {
      const response = await axios.get(`https://api.github.com/repos/${githubUsername}/${repoName}`, {
        headers: { Authorization: `token ${userSetting.accessToken}` }
      });

      userSetting.repos = userSetting.repos || [];
      userSetting.repos.push({ owner: githubUsername, name: repoName });
      this.userSettings.set(message.author.id, userSetting);

      // GitHub 웹훅 설정
      await axios.post(`https://api.github.com/repos/${githubUsername}/${repoName}/hooks`, {
        name: 'web',
        active: true,
        events: ['push', 'pull_request'],
        config: {
          url: `https://your-bot-domain.com/webhook`,
          content_type: 'json',
          secret: GITHUB_WEBHOOK_SECRET,
        }
      }, {
        headers: { Authorization: `token ${userSetting.accessToken}` }
      });

      await message.reply(`${response.data.full_name} 레포지토리에 대한 알림이 설정되었습니다.`);
    } catch (error) {
      console.error(error);
      await message.reply('레포지토리를 찾을 수 없거나 권한이 없습니다.');
    }
  }

  public async notifyPullRequestOpened(payload: GithubWebhookPayload) {
    const { repository, sender, pull_request } = payload;
    const userSetting = Array.from(this.userSettings.entries()).find(([, setting]) =>
      setting.repos && setting.repos.some(repo =>
        repo.owner === repository.owner.login && repo.name === repository.name
      )
    );

    if (userSetting) {
      const [discordUserId] = userSetting;
      const embed = new EmbedBuilder()
        .setTitle('새로운 Pull Request가 열렸습니다!')
        .setColor('#0099ff')
        .setDescription(`${pull_request.title}\n${pull_request.html_url}`)
        .setAuthor({ name: sender.login, iconURL: sender.avatar_url })
        .setTimestamp();

      this.client.users.fetch(discordUserId).then(user => {
        user.send({ embeds: [embed] });
      });
    }
  }
}
