/**
 * Create Dataverse Tables for PM Capacity Enhancements
 *
 * Run this script once to create the 5 new tables and 1 new column.
 * Requires environment variables: DATAVERSE_TENANT_ID, DATAVERSE_CLIENT_ID,
 * DATAVERSE_CLIENT_SECRET, DATAVERSE_URL
 *
 * Usage: node scripts/create-dataverse-tables.js
 */

const PUBLISHER_PREFIX = 'cr55d'

async function getToken() {
  const tenantId = process.env.DATAVERSE_TENANT_ID
  const clientId = process.env.DATAVERSE_CLIENT_ID
  const clientSecret = process.env.DATAVERSE_CLIENT_SECRET
  const dataverseUrl = process.env.DATAVERSE_URL
  if (!tenantId || !clientId || !clientSecret || !dataverseUrl) {
    throw new Error('Missing env vars: DATAVERSE_TENANT_ID, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_URL')
  }
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: `${dataverseUrl}/.default`,
    }).toString(),
  })
  if (!resp.ok) throw new Error(`Token failed: ${resp.status}`)
  return (await resp.json()).access_token
}

async function apiCall(token, method, path, body) {
  const url = `${process.env.DATAVERSE_URL}/api/data/v9.2/${path}`
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(url, opts)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`${method} ${path} failed (${resp.status}): ${text}`)
  }
  if (resp.status === 204) return null
  return resp.json()
}

// Helper to get the publisher prefix ID
async function getPublisherPrefix(token) {
  const data = await apiCall(token, 'GET', `publishers?$filter=customizationprefix eq '${PUBLISHER_PREFIX}'&$select=publisherid,customizationprefix`)
  if (data?.value?.length > 0) return data.value[0].publisherid
  throw new Error(`Publisher with prefix '${PUBLISHER_PREFIX}' not found`)
}

async function getSolutionId(token) {
  // Try to find an existing solution, or use the default
  const data = await apiCall(token, 'GET', `solutions?$filter=ismanaged eq false&$select=solutionid,uniquename&$top=5&$orderby=createdon desc`)
  if (data?.value?.length > 0) return data.value[0].solutionid
  return null
}

// Create an entity (table) via metadata API
async function createEntity(token, schemaName, displayName, description, primaryField) {
  console.log(`\n📦 Creating table: ${schemaName}...`)
  try {
    await apiCall(token, 'POST', 'EntityDefinitions', {
      SchemaName: schemaName,
      DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: 1033 }] },
      DisplayCollectionName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName + 's', LanguageCode: 1033 }] },
      Description: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: 1033 }] },
      HasActivities: false,
      HasNotes: false,
      OwnershipType: 'UserOwned',
      PrimaryNameAttribute: primaryField.schemaName.toLowerCase(),
      Attributes: [
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: primaryField.schemaName,
          DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: primaryField.displayName, LanguageCode: 1033 }] },
          RequiredLevel: { Value: 'None' },
          MaxLength: primaryField.maxLength || 200,
          FormatName: { Value: 'Text' },
        }
      ],
    })
    console.log(`  ✅ Created ${schemaName}`)
    return true
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('0x80047013')) {
      console.log(`  ⏭️  ${schemaName} already exists, skipping`)
      return true
    }
    console.error(`  ❌ Failed: ${e.message}`)
    return false
  }
}

// Add a column (attribute) to an existing entity
async function addColumn(token, entitySchemaName, column) {
  console.log(`  📎 Adding column: ${column.SchemaName}...`)
  try {
    await apiCall(token, 'POST', `EntityDefinitions(LogicalName='${entitySchemaName.toLowerCase()}')/Attributes`, column)
    console.log(`    ✅ Added ${column.SchemaName}`)
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('0x80047013') || e.message.includes('0x80048403')) {
      console.log(`    ⏭️  ${column.SchemaName} already exists, skipping`)
    } else {
      console.error(`    ❌ Failed: ${e.message}`)
    }
  }
}

function stringCol(schemaName, displayName, maxLength = 200) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName,
    DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'None' },
    MaxLength: maxLength,
    FormatName: { Value: 'Text' },
  }
}

function intCol(schemaName, displayName) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    SchemaName: schemaName,
    DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'None' },
    Format: 'None',
    MinValue: 0,
    MaxValue: 100000,
  }
}

function dateCol(schemaName, displayName) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName: schemaName,
    DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'None' },
    Format: 'DateOnly',
    DateTimeBehavior: { Value: 'DateOnly' },
  }
}

function boolCol(schemaName, displayName) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schemaName,
    DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'None' },
    OptionSet: {
      TrueOption: { Value: 1, Label: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Yes', LanguageCode: 1033 }] } },
      FalseOption: { Value: 0, Label: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'No', LanguageCode: 1033 }] } },
    },
  }
}

function moneyCol(schemaName, displayName) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
    SchemaName: schemaName,
    DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'None' },
    PrecisionSource: 2,
  }
}

async function main() {
  console.log('🔧 Dataverse Schema Creation — PM Capacity Enhancements')
  console.log('=========================================================\n')

  const token = await getToken()
  console.log('🔑 Authenticated successfully\n')

  // ── 1. cr55d_schedulingchanges — Audit trail ──────────────────
  const t1 = await createEntity(token,
    `${PUBLISHER_PREFIX}_schedulingchanges`,
    'Scheduling Change',
    'Audit trail for PM Capacity calendar changes',
    { schemaName: `${PUBLISHER_PREFIX}_description`, displayName: 'Description', maxLength: 500 }
  )
  if (t1) {
    await addColumn(token, `${PUBLISHER_PREFIX}_schedulingchanges`, stringCol(`${PUBLISHER_PREFIX}_changetype`, 'Change Type', 100))
    await addColumn(token, `${PUBLISHER_PREFIX}_schedulingchanges`, stringCol(`${PUBLISHER_PREFIX}_author`, 'Author', 100))
    await addColumn(token, `${PUBLISHER_PREFIX}_schedulingchanges`, stringCol(`${PUBLISHER_PREFIX}_jobname`, 'Job Name', 200))
    await addColumn(token, `${PUBLISHER_PREFIX}_schedulingchanges`, stringCol(`${PUBLISHER_PREFIX}_previousvalue`, 'Previous Value', 500))
    await addColumn(token, `${PUBLISHER_PREFIX}_schedulingchanges`, stringCol(`${PUBLISHER_PREFIX}_newvalue`, 'New Value', 500))
  }

  // ── 2. cr55d_jobscheduledays — Non-contiguous scheduling ──────
  const t2 = await createEntity(token,
    `${PUBLISHER_PREFIX}_jobscheduledays`,
    'Job Schedule Day',
    'Per-day scheduling for non-contiguous job dates',
    { schemaName: `${PUBLISHER_PREFIX}_name`, displayName: 'Name', maxLength: 200 }
  )
  if (t2) {
    await addColumn(token, `${PUBLISHER_PREFIX}_jobscheduledays`, dateCol(`${PUBLISHER_PREFIX}_date`, 'Date'))
    await addColumn(token, `${PUBLISHER_PREFIX}_jobscheduledays`, stringCol(`${PUBLISHER_PREFIX}_timeslot`, 'Time Slot', 50))
    await addColumn(token, `${PUBLISHER_PREFIX}_jobscheduledays`, stringCol(`${PUBLISHER_PREFIX}_daytype`, 'Day Type', 50))
    await addColumn(token, `${PUBLISHER_PREFIX}_jobscheduledays`, stringCol(`${PUBLISHER_PREFIX}_pmassigned`, 'PM Assigned', 100))
    await addColumn(token, `${PUBLISHER_PREFIX}_jobscheduledays`, intCol(`${PUBLISHER_PREFIX}_crewcount`, 'Crew Count'))
    await addColumn(token, `${PUBLISHER_PREFIX}_jobscheduledays`, stringCol(`${PUBLISHER_PREFIX}_notes`, 'Notes', 500))
  }

  // ── 3. cr55d_holidays — Holiday definitions ───────────────────
  const t3 = await createEntity(token,
    `${PUBLISHER_PREFIX}_holidays`,
    'Holiday',
    'Company holidays with worker availability overrides',
    { schemaName: `${PUBLISHER_PREFIX}_name`, displayName: 'Holiday Name', maxLength: 100 }
  )
  if (t3) {
    await addColumn(token, `${PUBLISHER_PREFIX}_holidays`, dateCol(`${PUBLISHER_PREFIX}_date`, 'Date'))
    await addColumn(token, `${PUBLISHER_PREFIX}_holidays`, intCol(`${PUBLISHER_PREFIX}_workersavailable`, 'Workers Available'))
    await addColumn(token, `${PUBLISHER_PREFIX}_holidays`, boolCol(`${PUBLISHER_PREFIX}_isrecurring`, 'Is Recurring'))
  }

  // ── 4. cr55d_tempworkers — Temp worker bookings ───────────────
  const t4 = await createEntity(token,
    `${PUBLISHER_PREFIX}_tempworkers`,
    'Temp Worker Booking',
    'Temporary staffing company bookings with headcount and dates',
    { schemaName: `${PUBLISHER_PREFIX}_companyname`, displayName: 'Company Name', maxLength: 200 }
  )
  if (t4) {
    await addColumn(token, `${PUBLISHER_PREFIX}_tempworkers`, intCol(`${PUBLISHER_PREFIX}_headcount`, 'Headcount'))
    await addColumn(token, `${PUBLISHER_PREFIX}_tempworkers`, dateCol(`${PUBLISHER_PREFIX}_startdate`, 'Start Date'))
    await addColumn(token, `${PUBLISHER_PREFIX}_tempworkers`, dateCol(`${PUBLISHER_PREFIX}_enddate`, 'End Date'))
    await addColumn(token, `${PUBLISHER_PREFIX}_tempworkers`, moneyCol(`${PUBLISHER_PREFIX}_costperday`, 'Cost Per Day'))
    await addColumn(token, `${PUBLISHER_PREFIX}_tempworkers`, stringCol(`${PUBLISHER_PREFIX}_notes`, 'Notes', 500))
  }

  // ── 5. cr55d_employeeblockouts — Employee date blocks ─────────
  const t5 = await createEntity(token,
    `${PUBLISHER_PREFIX}_employeeblockouts`,
    'Employee Blockout',
    'Employee date blocks and recurring unavailability rules',
    { schemaName: `${PUBLISHER_PREFIX}_reason`, displayName: 'Reason', maxLength: 200 }
  )
  if (t5) {
    await addColumn(token, `${PUBLISHER_PREFIX}_employeeblockouts`, dateCol(`${PUBLISHER_PREFIX}_startdate`, 'Start Date'))
    await addColumn(token, `${PUBLISHER_PREFIX}_employeeblockouts`, dateCol(`${PUBLISHER_PREFIX}_enddate`, 'End Date'))
    await addColumn(token, `${PUBLISHER_PREFIX}_employeeblockouts`, boolCol(`${PUBLISHER_PREFIX}_isrecurring`, 'Is Recurring'))
    await addColumn(token, `${PUBLISHER_PREFIX}_employeeblockouts`, stringCol(`${PUBLISHER_PREFIX}_recurringpattern`, 'Recurring Pattern', 100))
  }

  // ── 6. Add cr55d_timeslot column to cr55d_jobs ────────────────
  console.log('\n📎 Adding timeslot column to cr55d_jobs...')
  await addColumn(token, `${PUBLISHER_PREFIX}_jobs`, stringCol(`${PUBLISHER_PREFIX}_timeslot`, 'Time Slot', 50))

  console.log('\n=========================================================')
  console.log('✅ Schema creation complete!')
  console.log('\nNote: Lookup relationships (e.g., jobid on schedulingchanges,')
  console.log('staffid on employeeblockouts) should be created manually in')
  console.log('the Dataverse maker portal for proper referential integrity.')
  console.log('The app uses text-based references as a fallback.')
}

main().catch(e => { console.error('\n💥 Fatal error:', e.message); process.exit(1) })
