function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    
    var action = (data.action || '').trim();
    var email = (data.email || '').trim().toLowerCase();
    
    if (!email || !validateEmail(email)) {
      return responseJSON({ success: false, error: 'Invalid or missing email address.' }, 400);
    }
    
    if (action === 'sendOtp') {
      return handleSendOtp(email);
    } else if (action === 'verifyOtp') {
      var otp = (data.otp || '').trim();
      return handleVerifyOtp(email, otp);
    } else {
      return responseJSON({ success: false, error: 'Invalid action. Supported: sendOtp, verifyOtp' }, 400);
    }
  } catch (err) {
    return responseJSON({ success: false, error: 'Server Exception: ' + err.toString() }, 500);
  }
}

// Enable CORS Preflight OPTIONS requests
function doGet(e) {
  return responseJSON({ status: 'active', message: 'Sangarsh Science OMR Email OTP Service Running' }, 200);
}

/**
 * Handle OTP Generation and Professional Email Delivery
 */
function handleSendOtp(email) {
  var cache = CacheService.getScriptCache();
  
  // Rate Limit: 60s cooldown between OTP requests
  var rateKey = 'rate_' + email;
  if (cache.get(rateKey)) {
    return responseJSON({ 
      success: false, 
      error: 'Please wait 60 seconds before requesting a new OTP.' 
    }, 429);
  }
  
  // Generate Cryptographically Secure 6-Digit OTP
  var otp = generateSecureOtp();
  var otpHash = hashSha256(otp);
  
  // Cache Hashed OTP & Reset Attempt Count (Expires in 300 seconds / 5 minutes)
  var otpKey = 'otp_' + email;
  var attemptsKey = 'attempts_' + email;
  
  cache.put(otpKey, otpHash, 300);
  cache.put(attemptsKey, '0', 300);
  cache.put(rateKey, '1', 60); // 60s cooldown
  
  // Send Professional HTML Email via MailApp
  var subject = 'OMR Evaluation System - Your OTP';
  var htmlBody = buildOtpEmailHtml(otp);
  var textBody = 'OMR Evaluation System\n\nYour OTP is: ' + otp + '\nThis OTP is valid for 5 minutes.\n\nIf you did not request this code, please ignore this email.';
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: textBody,
      htmlBody: htmlBody,
      name: 'Sangarsh Science Education'
    });
  } catch (mailErr) {
    return responseJSON({ 
      success: false, 
      error: 'Failed to send email: ' + mailErr.toString() 
    }, 500);
  }
  
  // Return JSON Response without exposing OTP
  return responseJSON({
    success: true,
    message: 'A 6-digit OTP code has been sent to ' + email,
    email: email,
    expiresInSeconds: 300
  }, 200);
}

/**
 * Handle OTP Verification with Attempt Limits & Invalidation
 */
function handleVerifyOtp(email, otp) {
  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return responseJSON({ success: false, error: 'Please enter a valid 6-digit OTP code.' }, 400);
  }
  
  var cache = CacheService.getScriptCache();
  var otpKey = 'otp_' + email;
  var attemptsKey = 'attempts_' + email;
  
  var storedHash = cache.get(otpKey);
  var attempts = parseInt(cache.get(attemptsKey) || '0', 10);
  
  if (!storedHash) {
    return responseJSON({ 
      success: false, 
      error: 'OTP code has expired or was not requested. Please request a new OTP.' 
    }, 400);
  }
  
  if (attempts >= 5) {
    // Invalidate OTP on max attempts
    cache.remove(otpKey);
    cache.remove(attemptsKey);
    return responseJSON({ 
      success: false, 
      error: 'Maximum verification attempts exceeded (5/5). Please request a new OTP.' 
    }, 429);
  }
  
  var inputHash = hashSha256(otp);
  
  if (inputHash !== storedHash) {
    attempts += 1;
    cache.put(attemptsKey, attempts.toString(), 300);
    return responseJSON({ 
      success: false, 
      error: 'Incorrect OTP code. Remaining attempts: ' + (5 - attempts) 
    }, 400);
  }
  
  // Successful Verification: Invalidate OTP immediately
  cache.remove(otpKey);
  cache.remove(attemptsKey);
  
  return responseJSON({
    success: true,
    message: 'OTP verified successfully.',
    email: email,
    authenticated: true
  }, 200);
}

/**
 * Utility Functions
 */
function generateSecureOtp() {
  var randomNumber = Math.floor(Math.random() * 900000) + 100000;
  return randomNumber.toString();
}

function hashSha256(input) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  var txtHash = '';
  for (var i = 0; i < rawHash.length; i++) {
    var byteValue = rawHash[i];
    if (byteValue < 0) byteValue += 256;
    var byteString = byteValue.toString(16);
    if (byteString.length === 1) byteString = '0' + byteString;
    txtHash += byteString;
  }
  return txtHash;
}

function validateEmail(email) {
  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function responseJSON(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Professional HTML Email Template
 */
function buildOtpEmailHtml(otp) {
  return '' +
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<style>' +
    '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; }' +
    '  .card { max-width: 480px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }' +
    '  .header { text-align: center; margin-bottom: 24px; }' +
    '  .logo { display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #1E40AF, #0F172A); border-radius: 12px; color: #F59E0B; font-weight: 800; font-size: 18px; line-height: 48px; text-align: center; }' +
    '  .title { font-size: 20px; font-weight: 800; color: #0F172A; margin-top: 12px; margin-bottom: 4px; }' +
    '  .subtitle { font-size: 12px; font-weight: 700; color: #2563EB; text-transform: uppercase; letter-spacing: 1px; }' +
    '  .otp-container { background: #EFF6FF; border: 2px dashed #3B82F6; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }' +
    '  .otp-label { font-size: 12px; font-weight: 700; color: #1E40AF; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px; }' +
    '  .otp-code { font-size: 32px; font-weight: 800; font-family: monospace; letter-spacing: 8px; color: #1E3A8A; }' +
    '  .notice { font-size: 13px; color: #64748B; text-align: center; line-height: 1.5; margin-bottom: 20px; }' +
    '  .footer { border-top: 1px solid #F1F5F9; padding-top: 16px; font-size: 11px; color: #94A3B8; text-align: center; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '  <div class="card">' +
    '    <div class="header">' +
    '      <div class="logo">SSE</div>' +
    '      <div class="title">Sangarsh Science Education</div>' +
    '      <div class="subtitle">OMR Evaluation Portal Security</div>' +
    '    </div>' +
    '    <div class="otp-container">' +
    '      <span class="otp-label">Your Verification Code</span>' +
    '      <div class="otp-code">' + otp + '</div>' +
    '    </div>' +
    '    <p class="notice">This OTP is valid for <strong>5 minutes</strong>. For your security, do not share this code with anyone.</p>' +
    '    <div class="footer">' +
    '      &copy; Sangarsh Science Education. All rights reserved.<br>' +
    '      Automated security message — please do not reply.' +
    '    </div>' +
    '  </div>' +
    '</body>' +
    '</html>';
}
