/**
 * Autotask PSA API helpers for ticket and opportunity management.
 * Used by recommendations routes to create/link AT objects.
 */
const axios = require('axios')

function buildClient() {
  const zone = process.env.AUTOTASK_ZONE || 'webservices1'
  return axios.create({
    baseURL: `https://${zone}.autotask.net/ATServicesRest/V1.0`,
    headers: {
      ApiIntegrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
      UserName:           process.env.AUTOTASK_API_USER,
      Secret:             process.env.AUTOTASK_API_SECRET,
      'Content-Type':     'application/json',
    },
    timeout: 15000,
  })
}

// ─── Picklist cache (in-memory, per-entity) ──────────────────────────────────

const _fieldCache = {}

async function getEntityFields(entity) {
  if (_fieldCache[entity]) return _fieldCache[entity]
  const client = buildClient()
  const res = await client.get(`/${entity}/entityInformation/fields`)
  _fieldCache[entity] = res.data?.fields || []
  return _fieldCache[entity]
}

function extractPicklist(fields, fieldName) {
  const f = fields.find(f => f.name === fieldName)
  return (f?.picklistValues || [])
    .filter(v => v.isActive)
    .map(v => ({ value: parseInt(v.value), label: v.label }))
}

// ─── Ticket picklists ────────────────────────────────────────────────────────

async function getTicketPicklists() {
  const fields = await getEntityFields('Tickets')
  return {
    statuses:      extractPicklist(fields, 'status'),
    types:         extractPicklist(fields, 'ticketType'),
    issueTypes:    extractPicklist(fields, 'issueType'),
    subIssueTypes: extractPicklist(fields, 'subIssueType'),
    categories:    extractPicklist(fields, 'ticketCategory'),
    priorities:    extractPicklist(fields, 'priority'),
    queues:        extractPicklist(fields, 'queueID'),
    billingCodes:  extractPicklist(fields, 'billingCodeID'),
  }
}

// ─── Create a ticket ─────────────────────────────────────────────────────────

async function createTicket({ companyId, title, description, status, ticketType,
  priority, queueId, issueType, subIssueType, categoryId, billingCodeId, dueDate }) {
  const client = buildClient()
  const body = {
    companyID:      parseInt(companyId),
    title:          title?.substring(0, 255),
    description:    description || '',
    status:         status         || 1,
    ticketType:     ticketType     || 1,
    priority:       priority       || 3,
    queueID:        queueId        || null,
    issueType:      issueType      || null,
    subIssueType:   subIssueType   || null,
    ticketCategory: categoryId     || null,
    billingCodeID:  billingCodeId  || null,
    dueDateTime:    dueDate        || null,
  }
  // Remove null fields to avoid AT validation errors
  Object.keys(body).forEach(k => body[k] === null && delete body[k])
  const res = await client.post('/Tickets', { item: body })
  return res.data?.item || res.data
}

// ─── Opportunity picklists ───────────────────────────────────────────────────

async function getOpportunityPicklists() {
  const fields = await getEntityFields('Opportunities')
  return {
    statuses:    extractPicklist(fields, 'status'),
    stages:      extractPicklist(fields, 'stage'),
    categories:  extractPicklist(fields, 'opportunityCategoryID'),
    ratings:     extractPicklist(fields, 'rating'),
    sources:     extractPicklist(fields, 'leadSource'),
  }
}

// ─── Create an opportunity ───────────────────────────────────────────────────

async function createOpportunity({ companyId, title, status, stage, categoryId, rating,
  source, description, probability, totalRevenue, cost, onetimeRevenue,
  monthlyRevenue, yearlyRevenue, estimatedCloseDate, startDate }) {
  const client = buildClient()
  const body = {
    accountID:              parseInt(companyId),
    title:                  title?.substring(0, 255),
    status:                 status  || 1,
    stage:                  stage   || 0,
    opportunityCategoryID:  categoryId || null,
    rating:                 rating  || null,
    leadSource:             source  || null,
    description:            description || '',
    probability:            probability || 50,
    totalAmount:            totalRevenue    || 0,
    cost:                   cost            || 0,
    onetimeRevenue:         onetimeRevenue  || 0,
    monthlyRevenue:         monthlyRevenue  || 0,
    yearlyRevenue:          yearlyRevenue   || 0,
    estimatedCloseDate:     estimatedCloseDate || null,
    startDate:              startDate || new Date().toISOString().split('T')[0],
  }
  Object.keys(body).forEach(k => body[k] === null && delete body[k])
  const res = await client.post('/Opportunities', { item: body })
  return res.data?.item || res.data
}

// ─── Search tickets for a company ────────────────────────────────────────────

async function searchTickets({ companyId, q, maxRecords = 50 }) {
  const client = buildClient()
  const filter = [{ field: 'companyID', op: 'eq', value: parseInt(companyId) }]
  if (q) {
    filter.push({
      op: 'or',
      items: [
        { field: 'title',        op: 'contains', value: q },
        { field: 'ticketNumber', op: 'contains', value: q },
      ],
    })
  }
  const res = await client.post('/Tickets/query', {
    filter,
    maxRecords,
    IncludeFields: ['id', 'ticketNumber', 'title', 'status', 'companyID'],
  })
  return res.data?.items || []
}

// ─── Search opportunities for a company ──────────────────────────────────────

async function searchOpportunities({ companyId, q, maxRecords = 50 }) {
  const client = buildClient()
  const filter = [{ field: 'accountID', op: 'eq', value: parseInt(companyId) }]
  if (q) {
    filter.push({ field: 'title', op: 'contains', value: q })
  }
  const res = await client.post('/Opportunities/query', {
    filter,
    maxRecords,
    IncludeFields: ['id', 'title', 'status', 'accountID', 'totalAmount'],
  })
  return res.data?.items || []
}

module.exports = {
  getTicketPicklists,
  createTicket,
  searchTickets,
  getOpportunityPicklists,
  createOpportunity,
  searchOpportunities,
}
