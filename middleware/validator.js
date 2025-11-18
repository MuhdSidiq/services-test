/**
 * Validation middleware for WhatsApp template message requests
 */
function validateTemplateMessage(req, res, next) {
  const { to, templateName, languageCode, components } = req.body;

  // Validate required fields
  if (!to) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: to (recipient phone number)'
    });
  }

  if (!templateName) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: templateName'
    });
  }

  // Validate phone number format (basic validation)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(to.replace(/\s/g, ''))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format. Must be in international format (e.g., 1234567890 or +1234567890)'
    });
  }

  // Validate template name (alphanumeric and underscores only)
  const templateNameRegex = /^[a-z0-9_]+$/;
  if (!templateNameRegex.test(templateName)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid template name. Must contain only lowercase letters, numbers, and underscores'
    });
  }

  // Validate languageCode if provided
  if (languageCode) {
    const langCodeRegex = /^[a-z]{2}(_[A-Z]{2})?$/;
    if (!langCodeRegex.test(languageCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid language code format. Use formats like "en", "en_US", "id"'
      });
    }
  }

  // Validate components structure if provided
  if (components && !Array.isArray(components)) {
    return res.status(400).json({
      success: false,
      error: 'Components must be an array'
    });
  }

  // All validations passed
  next();
}

module.exports = {
  validateTemplateMessage
};
