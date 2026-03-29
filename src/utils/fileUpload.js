import { dvPost } from '../hooks/useDataverse'

/**
 * Upload a file as a Dataverse annotation (note attachment) linked to a job.
 * This is the same pattern the Sales Hub uses for document storage.
 * @param {File} file - The file to upload
 * @param {string} jobId - The cr55d_jobid to link the annotation to
 * @param {string} subject - The annotation subject/title
 * @returns {Promise<Object>} The created annotation record
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function uploadFileToJob(file, jobId, subject) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 10MB.`)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        // Extract base64 content (remove data URL prefix)
        const base64 = reader.result.split(',')[1]

        const annotation = {
          subject: subject || file.name,
          filename: file.name,
          mimetype: file.type || 'application/octet-stream',
          documentbody: base64,
          notetext: `Uploaded from Ops Base Camp on ${new Date().toLocaleDateString()}`,
          'objectid_cr55d_job@odata.bind': `/cr55d_jobs(${jobId})`,
        }

        const result = await dvPost('annotations', annotation)
        resolve(result)
      } catch (err) {
        reject(new Error(`Upload failed: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Open a file picker and upload the selected file to a job.
 * Shows a toast on success/failure.
 * @param {string} jobId - The job ID to attach to
 * @param {string} subject - The subject for the annotation
 * @param {string} accept - File input accept attribute (e.g., '.pdf')
 * @param {Function} onSuccess - Callback on success with filename
 * @param {Function} onError - Callback on error with message
 */
export function pickAndUploadFile(jobId, subject, accept, onSuccess, onError) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept || '.pdf,.jpg,.png,.doc,.docx'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadFileToJob(file, jobId, subject)
      if (onSuccess) onSuccess(file.name)
    } catch (err) {
      if (onError) onError(err.message)
    }
  }
  input.click()
}
