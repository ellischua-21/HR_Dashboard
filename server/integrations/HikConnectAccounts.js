const { createHikConnectClient } = require('./HikConnectClient');

const SETTINGS = ['API_BASE_URL', 'APP_KEY', 'SECRET_KEY'];

// Preserve the original account settings and discover additional numbered accounts.
function createHikConnectAccounts({ env = process.env } = {}) {
  const prefixes = new Set();
  for (const [key, value] of Object.entries(env)) {
    if (!String(value || '').trim()) continue;
    const match =
      /^HIKCONNECT_([1-9]\d*)_(API_BASE_URL|APP_KEY|SECRET_KEY)$/.exec(key);
    if (match && Number(match[1]) >= 2) prefixes.add(`HIKCONNECT_${match[1]}_`);
  }
  if (
    SETTINGS.some((name) => String(env[`HIKCONNECT_${name}`] || '').trim()) ||
    !prefixes.size
  )
    prefixes.add('HIKCONNECT_');

  const accounts = [...prefixes]
    .sort((a, b) => {
      const number = (prefix) =>
        prefix === 'HIKCONNECT_' ? 1 : Number(prefix.split('_')[1]);
      return number(a) - number(b);
    })
    .map((prefix) => ({
      prefix,
      name: `Hik-Connect account ${prefix === 'HIKCONNECT_' ? '1' : prefix.split('_')[1]}`,
      client: createHikConnectClient({
        env: Object.fromEntries(
          SETTINGS.map((name) => [
            `HIKCONNECT_${name}`,
            String(env[`${prefix}${name}`] || '').trim()
          ])
        )
      })
    }));

  function configuration() {
    const missing = accounts.flatMap(({ prefix, client }) =>
      client
        .configuration()
        .missing.map((key) => `${prefix}${key.slice('HIKCONNECT_'.length)}`)
    );
    return { configured: missing.length === 0, missing };
  }

  return { accounts, configuration };
}

module.exports = { createHikConnectAccounts };
