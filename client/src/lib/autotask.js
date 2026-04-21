/**
 * Autotask deep link helpers.
 *
 * Base URL is fetched from /api/config at app startup and stored here.
 * Falls back to ww1.autotask.net if not yet loaded.
 */

let _baseUrl = 'https://ww1.autotask.net'

export function setAutotaskWebUrl(url) {
  if (url) _baseUrl = url.replace(/\/$/, '') // strip trailing slash
}

/**
 * Returns a deep link URL for an Autotask entity.
 *
 * @param {'company'|'contact'|'ci'} type
 * @param {string|number} id
 */
export function autotaskUrl(type, id) {
  if (!id) return null
  const base = `${_baseUrl}/Autotask/AutotaskExtend/ExecuteCommand.aspx`
  switch (type) {
    case 'company': return `${base}?Code=OpenAccount&AccountID=${id}`
    case 'contact': return `${base}?Code=OpenContact&ContactID=${id}`
    case 'ci':      return `${base}?Code=EditInstalledProduct&InstalledProductID=${id}`
    default:        return null
  }
}
