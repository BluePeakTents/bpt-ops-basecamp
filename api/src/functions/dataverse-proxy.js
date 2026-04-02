const { app } = require('@azure/functions');

async function getDataverseToken() {
  const tenantId = process.env.DATAVERSE_TENANT_ID;
  const clientId = process.env.DATAVERSE_CLIENT_ID;
  const clientSecret = process.env.DATAVERSE_CLIENT_SECRET;
  const dataverseUrl = process.env.DATAVERSE_URL;
  if (!tenantId || !clientId || !clientSecret || !dataverseUrl) {
    throw new Error('Dataverse credentials not configured');
  }
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: `${dataverseUrl}/.default` }).toString()
  });
  if (!resp.ok) throw new Error('Token request failed: ' + resp.status);
  return (await resp.json()).access_token;
}

// Entity whitelist — only allow access to known tables
const ALLOWED_ENTITIES = [
  // Core job tables
  'cr55d_jobs', 'cr55d_quoteversions', 'cr55d_jobnotes', 'cr55d_julietickets',
  'cr55d_permits', 'cr55d_jobcostsheets', 'cr55d_portapottyorders',
  'cr55d_subrentals', 'cr55d_jobpurchases',
  // Catalog & AI
  'cr55d_catalogskus', 'cr55d_aiinstructions', 'cr55d_aichatsessions',
  // People & Scheduling
  'cr55d_stafflists', 'cr55d_crewassignments', 'cr55d_opsdepartments',
  // Fleet
  'cr55d_vehicles',
  // Notifications
  'cr55d_notifications',
  // Production
  'cr55d_productionschedules', 'cr55d_productionmilestones',
  'cr55d_loadlists', 'cr55d_loadlistlines',
  // Inventory
  'cr55d_inventorys', 'cr55d_inventories', 'cr55d_inventoryitems', 'cr55d_jobinventoryreservations',
  // Reporting
  'cr55d_bugreports', 'cr55d_featurerequests', 'cr55d_errorlogs',
  // Venues
  'cr55d_venues',
  // Travel
  'cr55d_travelbookings',
  // Scheduling enhancements
  'cr55d_schedulingchanges', 'cr55d_jobscheduledays',
  'cr55d_holidays', 'cr55d_tempworkers', 'cr55d_employeeblockouts',
  // Error logs
  'cr55d_errorlogs',
  // File attachments
  'annotations'
];

// Block DELETE on critical tables
const NO_DELETE = ['cr55d_jobs', 'cr55d_quoteversions', 'cr55d_stafflists', 'cr55d_vehicles'];

app.http('dataverse-proxy', {
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  authLevel: 'anonymous',
  route: 'dataverse-proxy/{*path}',
  handler: async (request, context) => {
    try {
      const dataverseUrl = process.env.DATAVERSE_URL;
      if (!dataverseUrl) return { status: 500, jsonBody: { error: 'DATAVERSE_URL not configured' } };

      const path = request.params.path;
      if (!path || !path.trim()) {
        return { status: 400, jsonBody: { error: 'API path is required' } };
      }
      const entity = path.split('(')[0].split('?')[0].toLowerCase();

      if (!ALLOWED_ENTITIES.includes(entity)) {
        return { status: 403, jsonBody: { error: `Entity '${entity}' not in allowlist` } };
      }
      if (request.method === 'DELETE' && NO_DELETE.includes(entity)) {
        return { status: 403, jsonBody: { error: `DELETE not allowed on '${entity}'` } };
      }

      if (['POST', 'PATCH'].includes(request.method)) {
        const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
        if (contentLength > 1000000) {
          return { status: 413, jsonBody: { error: 'Request body too large (max 1MB)' } }
        }
      }

      const token = await getDataverseToken();
      const queryString = new URL(request.url).search;
      const url = `${dataverseUrl}/api/data/v9.2/${path}${queryString}`;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Accept': 'application/json',
        'Prefer': 'odata.include-annotations="*"'
      };

      const opts = { method: request.method, headers };
      if (['POST', 'PATCH'].includes(request.method)) {
        headers['Content-Type'] = 'application/json';
        const body = await request.text();
        if (body) opts.body = body;
        if (request.method === 'POST') headers['Prefer'] = 'return=representation';
      }

      const resp = await fetch(url, opts);

      if (resp.status === 204) return { status: 204 };

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const text = await resp.text();
        try {
          const data = JSON.parse(text);
          return { status: resp.status, jsonBody: data };
        } catch (parseErr) {
          return { status: 502, jsonBody: { error: 'Invalid response from Dataverse' } };
        }
      }
      return { status: resp.status, body: await resp.text() };
    } catch (error) {
      context.error('Dataverse proxy error:', error);
      return { status: 500, jsonBody: { error: error.message } };
    }
  }
});
