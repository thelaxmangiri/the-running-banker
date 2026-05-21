/**
 * Code.gs - The Running Banker Backend
 * Google Apps Script Web App Endpoint
 * Serves as a REST API for Laxman Giri's portfolio website.
 */

// 1. MAIN ENTRY POINT (doPost)
// Handles inbound requests, bypasses CORS Options preflights using Text content types
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    
    // PUBLIC ACCESS ENDPOINT
    if (action === "getDashboardData") {
      const data = getDashboardData();
      return jsonResponse({ success: true, data: data });
    }
    
    // SECURED ADMINISTRATIVE ENDPOINTS
    const firebaseToken = payload.firebaseToken;
    const authResult = verifyFirebaseToken(firebaseToken);
    
    if (!authResult.valid) {
      return jsonResponse({ success: false, error: "Unauthorized: Invalid administrative credentials." });
    }
    
    const adminEmail = authResult.email;
    let responseData = { success: true };
    
    switch (action) {
      case "syncStrava":
        const syncResult = syncStravaActivities();
        responseData.newActivities = syncResult;
        break;
        
      case "syncAllActivities":
        const fullSyncResult = syncAllStravaActivities();
        responseData.newActivities = fullSyncResult.added;
        responseData.totalFetched = fullSyncResult.totalFetched;
        responseData.pages = fullSyncResult.pages;
        break;
        
      case "setupDailyTrigger":
        createDailySyncTrigger();
        break;
        
      case "createPost":
        createBlogPost(payload.post);
        break;
        
      case "updatePost":
        updateBlogPost(payload.postId, payload.updates);
        break;
        
      case "deletePost":
        deleteBlogPost(payload.postId);
        break;
        
      case "uploadPhoto":
        const imageUrl = uploadPhotoToGitHub(payload.imageBase64, payload.caption);
        insertGalleryPhoto(imageUrl, payload.caption, payload.displayOrder);
        break;
        
      case "uploadBlogPhoto":
        const blogImageUrl = uploadPhotoToGitHub(payload.imageBase64, payload.caption);
        responseData.imageUrl = blogImageUrl;
        break;
        
      case "updatePhoto":
        updateGalleryPhoto(payload.photoId, payload.updates);
        break;
        
      case "deletePhoto":
        deletePhotoFromGitHub(payload.imageUrl);
        deleteGalleryPhoto(payload.photoId);
        break;
        
      case "reorderPhotos":
        reorderGalleryPhotos(payload.photoOrderMap);
        break;
        
      case "updateSettings":
        updateSystemSettings(payload.settings);
        break;
        
      default:
        return jsonResponse({ success: false, error: "Unknown API action request." });
    }
    
    return jsonResponse(responseData);
    
  } catch (error) {
    Logger.log("Execution Crash: " + error.toString());
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// 2. CORS-SAFE JSON RESPONSE BUILDER
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 3. FIREBASE TOKEN VALIDATOR
// Authenticates incoming requests securely via standard Google Identity REST lookups
function verifyFirebaseToken(idToken) {
  if (!idToken) return { valid: false, email: "" };
  
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty('FIREBASE_WEB_API_KEY');
  const allowedAdmin = properties.getProperty('ADMIN_EMAIL') || "laxman@therunningbanker.com";
  
  if (!apiKey) {
    throw new Error("Config Failure: FIREBASE_WEB_API_KEY is not defined in Script Properties.");
  }
  
  const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + apiKey;
  const payload = { idToken: idToken };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const resData = JSON.parse(response.getContentText());
  
  if (resData.users && resData.users.length > 0) {
    const email = resData.users[0].email;
    if (email.toLowerCase() === allowedAdmin.toLowerCase()) {
      return { valid: true, email: email };
    }
  }
  
  return { valid: false, email: "" };
}

// 4. DATABASE ACCESS HELPER
// Opens/resolves sheets, automatically creating tables and headers on initial run
function getSheet(sheetName) {
  const properties = PropertiesService.getScriptProperties();
  const ssId = properties.getProperty('SPREADSHEET_ID');
  
  let ss;
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      throw new Error("Configuration Error: SPREADSHEET_ID is missing from Script Properties.");
    }
  }
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initializeHeaders(sheet, sheetName);
  }
  return sheet;
}

function initializeHeaders(sheet, name) {
  let headers = [];
  if (name === "Strava_Activities") {
    headers = ["id", "name", "distance", "moving_time", "elapsed_time", "type", "start_date", "start_date_local", "average_speed", "max_speed", "total_elevation_gain"];
  } else if (name === "Blog_Posts") {
    headers = ["id", "title", "category", "excerpt", "content", "image_url", "created_at"];
  } else if (name === "Gallery_Photos") {
    headers = ["id", "image_url", "caption", "display_order", "uploaded_at"];
  } else if (name === "Settings") {
    headers = ["key", "value"];
    sheet.appendRow(headers);
    sheet.appendRow(["next_marathon_title", "Kathmandu Marathon 🏅"]);
    sheet.appendRow(["next_marathon_date", "2026-10-18"]);
    sheet.appendRow(["weekly_target_km", "80"]);
    return;
  }
  sheet.appendRow(headers);
}

// 5. PUBLIC DASHBOARD DATA RETRIEVER
function getDashboardData() {
  const data = {
    metrics: {
      lastRun: null,
      weeklyVolume: { current: 0, target: 80 },
      ytdTotal: 0,
      countdown: null
    },
    chartData: { labels: [], datasets: [] },
    gallery: [],
    blogPosts: [],
    recentRuns: []
  };

  // A. Fetch Settings
  const settingsSheet = getSheet("Settings");
  const settingsRows = settingsSheet.getDataRange().getValues();
  const settingsMap = {};
  for (let i = 1; i < settingsRows.length; i++) {
    settingsMap[settingsRows[i][0]] = settingsRows[i][1];
  }
  
  const marathonTitle = settingsMap["next_marathon_title"] || "Next Marathon";
  const marathonDateStr = settingsMap["next_marathon_date"] || "";
  const weeklyTarget = Number(settingsMap["weekly_target_km"]) || 80;
  
  // B. Calculate Marathon Countdown
  if (marathonDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(marathonDateStr);
    targetDate.setHours(0, 0, 0, 0);
    const diffTime = targetDate.getTime() - today.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const dateFormatted = targetDate.toLocaleDateString(undefined, options);
    
    data.metrics.countdown = {
      title: marathonTitle,
      dateString: dateFormatted,
      daysLeft: daysLeft
    };
  }

  // C. Calculate Strava Analytics
  const stravaSheet = getSheet("Strava_Activities");
  const stravaRows = stravaSheet.getDataRange().getValues();
  
  if (stravaRows.length > 1) {
    const today = new Date();
    
    // Get start of the current week (Monday)
    const monday = new Date(today);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    
    const currentYear = today.getFullYear();
    let weeklySum = 0;
    let ytdSum = 0;
    let lastRunRow = null;
    
    // Monthly aggregations (past 6 months)
    const monthlyDistanceMap = {};
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Generate previous 6 months list dynamically
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(today.getMonth() - i);
      const mLabel = monthNames[d.getMonth()] + " " + d.getFullYear().toString().substring(2);
      monthlyDistanceMap[mLabel] = 0;
    }

    for (let i = 1; i < stravaRows.length; i++) {
      const row = stravaRows[i];
      const distance = Number(row[2]) || 0; // Distance in meters (Strava default is meters)
      const distKM = distance / 1000;
      const startDate = new Date(row[6]); // start_date
      
      if (isNaN(startDate.getTime())) continue;

      // Track last run details
      if (!lastRunRow || startDate > new Date(lastRunRow[6])) {
        lastRunRow = row;
      }
      
      // Weekly sum
      if (startDate >= monday && startDate <= today) {
        weeklySum += distKM;
      }
      
      // YTD sum
      if (startDate.getFullYear() === currentYear) {
        ytdSum += distKM;
      }
      
      // Monthly chart aggregation
      const label = monthNames[startDate.getMonth()] + " " + startDate.getFullYear().toString().substring(2);
      if (monthlyDistanceMap[label] !== undefined) {
        monthlyDistanceMap[label] += distKM;
      }
      
      // Collect for recent runs table
      data.recentRuns.push({
        name: row[1],
        distance: distKM.toFixed(1) + " km",
        duration: formatDuration(Number(row[3])),
        pace: formatPace(Number(row[8])),
        dateString: startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        dateObj: startDate.getTime()
      });
    }
    
    // Sort runs by date descending, take top 15
    data.recentRuns.sort((a, b) => b.dateObj - a.dateObj);
    data.recentRuns = data.recentRuns.slice(0, 15);
    
    data.metrics.weeklyVolume = {
      current: Math.round(weeklySum * 10) / 10,
      target: weeklyTarget
    };
    data.metrics.ytdTotal = Math.round(ytdSum * 10) / 10;
    
    // Formatting Last Run details
    if (lastRunRow) {
      const lastRunDist = Number(lastRunRow[2]) / 1000; // in km
      const lastRunDurSec = Number(lastRunRow[3]); // moving_time in sec
      const lastRunSpeed = Number(lastRunRow[8]); // average_speed in m/s
      const lastRunDate = new Date(lastRunRow[6]);
      
      data.metrics.lastRun = {
        name: lastRunRow[1],
        distance: lastRunDist.toFixed(1) + " km",
        pace: formatPace(lastRunSpeed),
        duration: formatDuration(lastRunDurSec),
        dateString: formatRelativeDate(lastRunDate)
      };
    }
    
    // Construct Chart.js datasets
    data.chartData.labels = Object.keys(monthlyDistanceMap);
    data.chartData.datasets = Object.values(monthlyDistanceMap).map(d => Math.round(d));
  } else {
    data.metrics.weeklyVolume = { current: 0, target: weeklyTarget };
    data.metrics.ytdTotal = 0;
  }

  // D. Fetch Gallery
  const gallerySheet = getSheet("Gallery_Photos");
  const galleryRows = gallerySheet.getDataRange().getValues();
  for (let i = galleryRows.length - 1; i >= 1; i--) {
    const row = galleryRows[i];
    data.gallery.push({
      id: Number(row[0]),
      image_url: row[1],
      caption: row[2],
      display_order: Number(row[3])
    });
  }
  // Sort gallery by display order
  data.gallery.sort((a, b) => a.display_order - b.display_order);

  // E. Fetch Blog Posts
  const blogSheet = getSheet("Blog_Posts");
  const blogRows = blogSheet.getDataRange().getValues();
  for (let i = blogRows.length - 1; i >= 1; i--) {
    const row = blogRows[i];
    data.blogPosts.push({
      id: Number(row[0]),
      title: row[1],
      category: row[2],
      excerpt: row[3],
      content: row[4],
      image_url: row[5],
      created_at: row[6]
    });
  }
  
  return data;
}

// Pace math: average speed in m/s to Pace string (min:sec/km)
function formatPace(speed) {
  if (!speed || speed <= 0) return "--";
  const totalSec = 1000 / speed;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return min + ":" + (sec < 10 ? "0" : "") + sec + " /km";
}

// Duration math: moving time in seconds to Hour-Minutes format
function formatDuration(secTotal) {
  if (!secTotal) return "--";
  const hours = Math.floor(secTotal / 3600);
  const mins = Math.floor((secTotal % 3600) / 60);
  if (hours > 0) {
    return hours + "h " + mins + "m";
  }
  return mins + "m";
}

// Relative date generator: "Yesterday", "2 days ago", or raw formatted date
function formatRelativeDate(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return diffDays + " days ago";
  
  return targetDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// 6. STRAVA ACTIVITIES DATA ACQUISITION

/**
 * getStravaAccessToken()
 * Shared helper: refreshes the Strava OAuth token and returns a valid access token.
 * Also persists a rotated refresh_token back to Script Properties if it changes.
 */
function getStravaAccessToken() {
  const properties = PropertiesService.getScriptProperties();
  const clientId     = properties.getProperty('STRAVA_CLIENT_ID');
  const clientSecret = properties.getProperty('STRAVA_CLIENT_SECRET');
  const refreshToken = properties.getProperty('STRAVA_REFRESH_TOKEN');
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Config Failure: Strava properties (CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN) are not fully defined.");
  }
  
  const authResponse = UrlFetchApp.fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "post",
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    },
    muteHttpExceptions: true
  });
  
  const authData = JSON.parse(authResponse.getContentText());
  
  if (!authData.access_token) {
    throw new Error("Strava OAuth handshake failed: " + authResponse.getContentText());
  }
  
  // Persist rotated refresh token
  if (authData.refresh_token && authData.refresh_token !== refreshToken) {
    properties.setProperty('STRAVA_REFRESH_TOKEN', authData.refresh_token);
  }
  
  return authData.access_token;
}

/**
 * appendActivityToSheet(sheet, existingIds, activity)
 * Appends a single Strava activity row to the sheet if it is not already present.
 * Returns true if a new row was inserted, false if it was a duplicate.
 */
function appendActivityToSheet(sheet, existingIds, activity) {
  const activityId = activity.id.toString();
  if (existingIds.indexOf(activityId) !== -1) return false; // Already recorded
  
  sheet.appendRow([
    activityId,
    activity.name,
    activity.distance,
    activity.moving_time,
    activity.elapsed_time,
    activity.type,
    activity.start_date,
    activity.start_date_local,
    activity.average_speed,
    activity.max_speed,
    activity.total_elevation_gain
  ]);
  
  existingIds.push(activityId); // Keep the in-memory set fresh for this run
  return true;
}

/**
 * syncStravaActivities()
 * Incremental sync — fetches Run activities from the PAST 30 DAYS only.
 * Fast and safe for scheduled / on-demand refresh.
 * Returns the count of newly inserted rows.
 */
function syncStravaActivities() {
  const accessToken = getStravaAccessToken();
  
  const thirtyDaysAgo = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000);
  const url = "https://www.strava.com/api/v3/athlete/activities?after=" + thirtyDaysAgo + "&per_page=50";
  
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": "Bearer " + accessToken },
    muteHttpExceptions: true
  });
  
  const activities = JSON.parse(response.getContentText());
  
  if (!Array.isArray(activities)) {
    throw new Error("Failed to fetch recent activities: " + response.getContentText());
  }
  
  const sheet = getSheet("Strava_Activities");
  const existingIds = getColumnValues(sheet, 1);
  
  let newCount = 0;
  activities.forEach(activity => {
    if (appendActivityToSheet(sheet, existingIds, activity)) newCount++;
  });
  
  Logger.log(`[syncStravaActivities] Incremental sync done. Added ${newCount} new runs.`);
  return newCount;
}

/**
 * syncAllStravaActivities()
 * FULL HISTORY sync — pages through ALL Strava activities using the Strava
 * pagination API (200 results per page) until an empty page is returned.
 * Deduplicates against existing sheet records so it is safe to run multiple times.
 *
 * Returns an object: { added, totalFetched, pages }
 */
function syncAllStravaActivities() {
  const accessToken = getStravaAccessToken();
  
  const sheet = getSheet("Strava_Activities");
  const existingIds = getColumnValues(sheet, 1); // Load existing IDs once
  
  let page = 1;
  const PER_PAGE = 100;  // Reliable page size
  let totalFetched = 0;
  let totalAdded   = 0;
  let totalPages   = 0;
  let hasMore      = true;
  
  Logger.log("[syncAllStravaActivities] Starting full history sync...");
  
  while (hasMore) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=${PER_PAGE}&page=${page}`;
    
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": "Bearer " + accessToken },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error(`Strava API error on page ${page}: ` + response.getContentText());
    }
    
    const activities = JSON.parse(response.getContentText());
    
    if (!Array.isArray(activities) || activities.length === 0) {
      hasMore = false;
      break;
    }
    
    totalFetched += activities.length;
    totalPages = page;
    
    activities.forEach(activity => {
      if (appendActivityToSheet(sheet, existingIds, activity)) totalAdded++;
    });
    
    Logger.log(`[syncAllStravaActivities] Page ${page}: fetched ${activities.length} activities, added ${totalAdded} runs so far.`);
    
    // Always fetch next page until we get an empty array.
    // Sometimes Strava returns fewer than PER_PAGE items even if there are more.
    page++;
    Utilities.sleep(500);
  }
  
  Logger.log(`[syncAllStravaActivities] Complete. Pages: ${totalPages}, Fetched: ${totalFetched}, New runs added: ${totalAdded}`);
  
  return {
    added: totalAdded,
    totalFetched: totalFetched,
    pages: totalPages
  };
}

/**
 * createDailySyncTrigger()
 * Programmatically creates a Google Apps Script time-driven trigger
 * to run the incremental sync every day at 8 AM.
 */
function createDailySyncTrigger() {
  // 1. Remove any existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "syncStravaActivities") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 2. Create the daily trigger
  // Note: This relies on the Google Apps Script project timezone being set to Asia/Kathmandu (NPT)
  ScriptApp.newTrigger("syncStravaActivities")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
    
  Logger.log("Daily trigger set for 8 AM.");
}

function getColumnValues(sheet, colIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const range = sheet.getRange(2, colIndex, lastRow - 1, 1);
  return range.getValues().map(row => row[0].toString());
}

// 7. BLOG POSTS OPERATIONS
function createBlogPost(post) {
  const sheet = getSheet("Blog_Posts");
  const id = Date.now();
  sheet.appendRow([
    id,
    post.title,
    post.category,
    post.excerpt,
    post.content,
    post.image_url,
    post.created_at
  ]);
}

function updateBlogPost(postId, updates) {
  const sheet = getSheet("Blog_Posts");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(postId)) {
      const rowNum = i + 1;
      
      if (updates.title !== undefined) sheet.getRange(rowNum, 2).setValue(updates.title);
      if (updates.category !== undefined) sheet.getRange(rowNum, 3).setValue(updates.category);
      if (updates.excerpt !== undefined) sheet.getRange(rowNum, 4).setValue(updates.excerpt);
      if (updates.content !== undefined) sheet.getRange(rowNum, 5).setValue(updates.content);
      if (updates.image_url !== undefined) sheet.getRange(rowNum, 6).setValue(updates.image_url);
      break;
    }
  }
}

function deleteBlogPost(postId) {
  const sheet = getSheet("Blog_Posts");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(postId)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// 8. GALLERY OPERATIONS (SHEETS DATA MAPPING)
function insertGalleryPhoto(imageUrl, caption, order) {
  const sheet = getSheet("Gallery_Photos");
  const id = Date.now();
  sheet.appendRow([
    id,
    imageUrl,
    caption,
    order || 10,
    new Date().toLocaleDateString()
  ]);
}

function updateGalleryPhoto(photoId, updates) {
  const sheet = getSheet("Gallery_Photos");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(photoId)) {
      const rowNum = i + 1;
      if (updates.caption !== undefined) sheet.getRange(rowNum, 3).setValue(updates.caption);
      if (updates.display_order !== undefined) sheet.getRange(rowNum, 4).setValue(updates.display_order);
      break;
    }
  }
}

function deleteGalleryPhoto(photoId) {
  const sheet = getSheet("Gallery_Photos");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(photoId)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function reorderGalleryPhotos(photoOrderMap) {
  const sheet = getSheet("Gallery_Photos");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const photoId = data[i][0].toString();
    if (photoOrderMap[photoId] !== undefined) {
      sheet.getRange(i + 1, 4).setValue(Number(photoOrderMap[photoId]));
    }
  }
}

// 9. GITHUB STORAGE INTEGRATOR
function uploadPhotoToGitHub(imageBase64, caption) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('GITHUB_TOKEN');
  const owner = properties.getProperty('GITHUB_REPO_OWNER');
  const repo = properties.getProperty('GITHUB_REPO_NAME') || "the-running-banker";
  const branch = properties.getProperty('GITHUB_BRANCH') || "main";
  
  if (!token || !owner) {
    throw new Error("GitHub Setup Missing: Verify token & repository configurations.");
  }
  
  // Extract raw base64 data stream
  const base64Parts = imageBase64.split(",");
  const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
  
  // Generate structured unique file pointer
  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 1000);
  const filename = "gallery_" + timestamp + "_" + rand + ".jpg";
  const path = "gallery/" + filename;
  
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const payload = {
    message: `Dynamic upload: ${caption || 'Moment'}` ,
    content: base64Data,
    branch: branch
  };
  
  const options = {
    method: "put",
    contentType: "application/json",
    headers: {
      "Authorization": "token " + token,
      "Accept": "application/vnd.github.v3+json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const resData = JSON.parse(response.getContentText());
  
  if (response.getResponseCode() !== 201 && response.getResponseCode() !== 200) {
    throw new Error("GitHub write failed: " + response.getContentText());
  }
  
  // Construct raw CDN deployment URL
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

function deletePhotoFromGitHub(imageUrl) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('GITHUB_TOKEN');
  const owner = properties.getProperty('GITHUB_REPO_OWNER');
  const repo = properties.getProperty('GITHUB_REPO_NAME') || "the-running-banker";
  const branch = properties.getProperty('GITHUB_BRANCH') || "main";
  
  if (!token || !owner) return; // Fail silently or skip deletion
  
  // Extract filename from full URL path
  const parts = imageUrl.split("/");
  const filename = parts[parts.length - 1];
  const path = "gallery/" + filename;
  
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    "Authorization": "token " + token,
    "Accept": "application/vnd.github.v3+json"
  };
  
  // A. Retrieve file metadata (sha hash)
  const getOptions = {
    method: "get",
    headers: headers,
    muteHttpExceptions: true
  };
  const getResponse = UrlFetchApp.fetch(url, getOptions);
  
  if (getResponse.getResponseCode() !== 200) {
    Logger.log("File not found on GitHub. Deleting local reference only.");
    return;
  }
  
  const fileMeta = JSON.parse(getResponse.getContentText());
  const sha = fileMeta.sha;
  
  // B. Execute Delete Call
  const deletePayload = {
    message: "Purging gallery photo: " + filename,
    sha: sha,
    branch: branch
  };
  
  const deleteOptions = {
    method: "delete",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify(deletePayload),
    muteHttpExceptions: true
  };
  
  const deleteResponse = UrlFetchApp.fetch(url, deleteOptions);
  if (deleteResponse.getResponseCode() !== 200) {
    Logger.log("GitHub deletion warning: " + deleteResponse.getContentText());
  }
}

// 10. UPDATE SYSTEM CONFIGURATIONS
function updateSystemSettings(settings) {
  const sheet = getSheet("Settings");
  
  // Read all existing rows to identify key indices
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  const keysToUpdate = {
    "next_marathon_title": settings.marathonTitle,
    "next_marathon_date": settings.marathonDate,
    "weekly_target_km": settings.weeklyTarget
  };
  
  const keyRows = {};
  for (let i = 1; i < values.length; i++) {
    keyRows[values[i][0]] = i + 1; // 1-based line row indices
  }
  
  // Inject or append settings keys
  Object.keys(keysToUpdate).forEach(key => {
    const val = keysToUpdate[key];
    if (keyRows[key] !== undefined) {
      sheet.getRange(keyRows[key], 2).setValue(val);
    } else {
      sheet.appendRow([key, val]);
    }
  });
}
