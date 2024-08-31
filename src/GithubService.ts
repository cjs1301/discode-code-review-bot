import axios from 'axios';
import crypto from 'crypto';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID as string;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET as string;
const REDIRECT_URI = process.env.REDIRECT_URI as string;

interface UserSetting {
  accessToken: string;
}

export class GithubService {
  private userSettings: Map<string, UserSetting>;
  private pendingAuths: Map<string, string>;

  constructor(userSettings: Map<string, UserSetting>, pendingAuths: Map<string, string>) {
    this.userSettings = userSettings;
    this.pendingAuths = pendingAuths;
  }

  public async handleAuthCallback(code: string, state: string) {
    const discordUserId = this.pendingAuths.get(state);

    if (!discordUserId) {
      throw new Error('Invalid state parameter');
    }

    try {
      const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }, {
        headers: { Accept: 'application/json' }
      });

      const { access_token } = tokenResponse.data;
      this.userSettings.set(discordUserId, { accessToken: access_token });
      this.pendingAuths.delete(state);

      return 'GitHub 계정이 성공적으로 연동되었습니다. 디스코드로 돌아가 !설정 명령어를 사용해주세요.';
    } catch (error) {
      console.error(error);
      throw new Error('An error occurred during GitHub authentication');
    }
  }

  public validateWebhookSignature(reqBody: any, signature: string, secret: string) {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(reqBody))
      .digest('hex');

    return signature === `sha256=${computedSignature}`;
  }
}
