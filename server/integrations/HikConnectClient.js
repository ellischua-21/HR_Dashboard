const { httpError } = require('../utils/HttpError');

const TOKEN_PATH = '/api/hccgw/platform/v1/token/get';
const REPORT_PATH = '/api/hccgw/attendance/v1/report/totaltimecard/list';
const SCANS_PATH = '/api/hccgw/acs/v1/event/certificaterecords/search';

function providerOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(
      'Set HIKCONNECT_API_BASE_URL to your regional HTTPS API address.',
      409
    );
  }
  const permittedHost = ['hikcentralconnect.com', 'hik-connect.com'].some(
    (domain) => url.hostname === domain || url.hostname.endsWith('.' + domain)
  );
  if (
    url.protocol !== 'https:' ||
    !permittedHost ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname) ||
    (url.port && url.port !== '443')
  ) {
    throw httpError(
      'Use the regional Hik-Connect HTTPS API host without a path.',
      409
    );
  }
  return url.origin;
}

function createHikConnectClient({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  let token = null;
  let tokenRequest = null;
  let queue = Promise.resolve();
  let lastRequestAt = 0;

  function configuration() {
    const missing = [
      'HIKCONNECT_API_BASE_URL',
      'HIKCONNECT_APP_KEY',
      'HIKCONNECT_SECRET_KEY'
    ].filter((key) => !String(env[key] || '').trim());
    return { configured: missing.length === 0, missing };
  }

  async function post(origin, path, body, accessToken) {
    // Keep all callers under the provider's five requests/second limit.
    const request = queue.then(async () => {
      const wait = Math.max(0, 250 - (Date.now() - lastRequestAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      let response;
      try {
        response = await fetchImpl(new URL(path, origin), {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Token: accessToken } : {})
          },
          body: JSON.stringify(body)
        });
      } catch {
        throw httpError(
          'Could not reach Hik-Connect. Check the API region and network connection.',
          422
        );
      }
      if (!response.ok) {
        throw httpError(
          `Hik-Connect returned HTTP ${response.status}. Check the API region and permissions.`,
          422
        );
      }
      let result;
      try {
        result = await response.json();
      } catch {
        throw httpError(
          'Hik-Connect did not return an API response. Check the API base URL.',
          422
        );
      }
      if (String(result?.errorCode) !== '0') {
        const code = String(result?.errorCode || '');
        const suffix = /^(OPEN\d{6}|\d{1,8})$/.test(code) ? ` (${code})` : '';
        throw httpError(
          `Hik-Connect rejected the request${suffix}. Check the credentials, region and attendance permissions.`,
          422
        );
      }
      return result.data;
    });
    queue = request.catch(() => {});
    return request;
  }

  async function authenticate() {
    if (!configuration().configured) {
      throw httpError(
        'Add the Hik-Connect settings to .env and restart the Node.js server.',
        409
      );
    }
    if (token && token.expiresAt > Date.now() + 60000) return token;
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      const origin = providerOrigin(env.HIKCONNECT_API_BASE_URL.trim());
      const data = await post(origin, TOKEN_PATH, {
        appKey: env.HIKCONNECT_APP_KEY.trim(),
        secretKey: env.HIKCONNECT_SECRET_KEY.trim()
      });
      if (!data?.accessToken || typeof data.accessToken !== 'string') {
        throw httpError('Hik-Connect did not provide an access token.', 422);
      }
      const expiry = Number(data.expireTime);
      const expiresAt = expiry > 1e12 ? expiry : expiry * 1000;
      token = {
        accessToken: data.accessToken,
        origin: data.areaDomain ? providerOrigin(data.areaDomain) : origin,
        expiresAt:
          Number.isFinite(expiresAt) && expiresAt > Date.now()
            ? Math.min(expiresAt, Date.now() + 7 * 86400000)
            : Date.now() + 300000
      };
      return token;
    })();
    try {
      return await tokenRequest;
    } finally {
      tokenRequest = null;
    }
  }

  async function search(query) {
    const credentials = await authenticate();
    const times = {
      beginTime: `${query.dateFrom}T00:00:00+08:00`,
      endTime: `${query.dateTo}T23:59:59+08:00`
    };
    const body = {
      pageIndex: query.providerPage || 1,
      pageSize: 200,
      searchCriteria: {
        ...times,
        type: 1,
        swipeAuthResult: 1,
        ...(query.employee
          ? {
              searchType: 0,
              personCondition: { personName: query.employee }
            }
          : {})
      }
    };
    try {
      return await post(
        credentials.origin,
        SCANS_PATH,
        body,
        credentials.accessToken
      );
    } catch (error) {
      // A subsequent manual retry obtains a fresh token without a request loop.
      token = null;
      throw error;
    }
  }

  async function searchDailySummary(query) {
    const credentials = await authenticate();
    const body = {
      pageIndex: query.providerPage || 1,
      pageSize: 200,
      beginTime: `${query.dateFrom}T00:00:00+08:00`,
      endTime: `${query.dateTo}T23:59:59+08:00`,
      ...(query.employee ? { personName: query.employee } : {})
    };
    try {
      return await post(
        credentials.origin,
        REPORT_PATH,
        body,
        credentials.accessToken
      );
    } catch (error) {
      token = null;
      throw error;
    }
  }

  return { configuration, search, searchDailySummary };
}

module.exports = { createHikConnectClient, providerOrigin };
