import type { Account, LoginResult } from './types';

export function checkLoginTarget(
  result: LoginResult,
  provider: Account['provider'],
  expectedAccount?: Pick<Account, 'id' | 'alias'>
): LoginResult {
  if (result.provider && result.provider !== provider) {
    throw new Error(
      `The last sign-in was for ${result.provider === 'codex' ? 'Codex' : 'Claude'}. Start a ${provider === 'codex' ? 'Codex' : 'Claude'} sign-in to reconnect this provider.`
    );
  }
  if (
    result.state === 'succeeded' &&
    expectedAccount &&
    result.accountId &&
    result.accountId !== expectedAccount.id
  ) {
    return {
      ...result,
      state: 'wrong-account',
      verification: 'pending',
      message: `A credential was saved for ${result.accountAlias || 'another account'}, but you selected ${expectedAccount.alias}. Start a new sign-in and choose the intended account on the provider’s page.`,
    };
  }
  return result;
}
