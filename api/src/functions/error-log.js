const { app } = require('@azure/functions');

let _tokenCache = { token: null, expires: 0 };
async function getDvToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expires) return _tokenCache.token;
  const resp = await fetch(`https://login.microsoftonline.com/${process.env.DATAVERSE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.DATAVERSE_CLIENT_ID, client_secret: process.env.DATAVERSE_CLIENT_SECRET, scope: `${process.env.DATAVERSE_URL}/.default` }).toString()
  });
  if (!resp.ok) throw new Error('Token failed: ' + resp.status);
  const data = await resp.json();
  _tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

app.http('error-log', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'error-log',
  handler: async (request, context) => {
    try {
      const dvUrl = process.env.DATAVERSE_URL;
      if (!dvUrl) return { status: 500, jsonBody: { error: 'DATAVERSE_URL not configured' } };

      const body = await request.json();
      const errors = Array.isArray(body) ? body : [body];
      if (!errors.length) return { status: 200, jsonBody: { written: 0 } };

      const token = await getDvToken();
      let written = 0;

      for (const err of errors) {
        try {
          const record = {
            cr55d_name: (err.errorMessage || '').substring(0, 200),
            cr55d_appname: err.appName || 'ops-basecamp',
            cr55d_environment: err.environment || 1,
            cr55d_severity: err.severity || 2,
            cr55d_errormessage: (err.errorMessage || '').substring(0, 4000),
            cr55d_stacktrace: (err.stackTrace || '').substring(0, 10000),
            cr55d_errortype: err.errorType || '',
            cr55d_url: (err.url || '').substring(0, 500),
            cr55d_useragent: (err.userAgent || '').substring(0, 500),
            cr55d_userid: (err.userId || '').substring(0, 200),
            cr55d_sessionid: (err.sessionId || '').substring(0, 200),
            cr55d_occurredon: err.occurredOn || new Date().toISOString(),
            cr55d_browserinfo: (err.browserInfo || '').substring(0, 500),
            cr55d_errorhash: (err.errorHash || '').substring(0, 100),
            cr55d_occurrencecount: err.occurrenceCount || 1,
            cr55d_metadata: typeof err.metadata === 'object' ? JSON.stringify(err.metadata).substring(0, 4000) : (err.metadata || '').substring(0, 4000)
          };

          await fetch(`${dvUrl}/api/data/v9.2/cr55d_errorlogs`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'OData-Version': '4.0' },
            body: JSON.stringify(record)
          });
          written++;
        } catch (e) {
          context.warn('Error log write failed:', e.message);
        }
      }

      return { status: 200, jsonBody: { written } };
    } catch (e) {
      context.error('Error log handler failed:', e.message);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
