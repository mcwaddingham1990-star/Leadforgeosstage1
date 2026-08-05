import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid';

function plaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET || process.env.PLAID_SANDBOX_SECRET;
  if (!clientId || !secret) {
    throw new Error('Plaid is not configured on the server. Add PLAID_CLIENT_ID and PLAID_SECRET.');
  }

  const environment = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  const basePath = environment === 'production'
    ? PlaidEnvironments.production
    : environment === 'development'
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox;

  return new PlaidApi(new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  }));
}

export async function createPlaidLinkToken(clientUserId: string) {
  const response = await plaidClient().linkTokenCreate({
    user: { client_user_id: clientUserId || 'ownerslocal-sandbox-owner' },
    client_name: "Owner'sLocal",
    language: 'en',
    country_codes: [CountryCode.Us],
    products: [Products.Auth, Products.Transactions, Products.Identity],
  });
  return { link_token: response.data.link_token };
}

export async function exchangePlaidPublicToken(publicToken: string, institutionName?: string) {
  if (!publicToken) throw new Error('Plaid public token is required.');

  const client = plaidClient();
  const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchange.data.access_token;
  const accountsResponse = await client.accountsBalanceGet({ access_token: accessToken });

  return {
    item_id: exchange.data.item_id,
    institution_name: institutionName || 'Connected bank',
    accounts: accountsResponse.data.accounts.map(account => ({
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      current_balance: account.balances.current,
      available_balance: account.balances.available,
      currency: account.balances.iso_currency_code || 'USD',
    })),
  };
}

