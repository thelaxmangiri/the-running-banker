// admin.js - The Running Banker Administrative Logic

// Configuration Status Flags
let isDemoMode = false;
let mockUser = null;
let activeTab = "blog";

// In-Memory Data Pools for local caching and Demo Mode persistence
let blogPosts = [];
let galleryPhotos = [];
let systemSettings = {
  marathonTitle: "Kathmandu Marathon 🏅",
  marathonDate: "2026-10-18",
  weeklyTarget: 80
};

// 1. Firebase Initialization & Fail-safe Demo Detection
let auth = null;
let AUTHORIZED_ADMIN_EMAIL = "laxman@therunningbanker.com";
let APPS_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";

if (typeof firebaseConfig === "undefined" || firebaseConfig.apiKey.includes("YOUR_API_KEY")) {
  console.warn("Firebase config not found or unconfigured. Unlocking Demonstration & Development Mode.");
  isDemoMode = true;
  
  // Load mock collections from LocalStorage to persist sandbox edits
  initializeDemoStorage();
} else {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  if (typeof AUTHORIZED_ADMIN_EMAIL_CONFIG !== "undefined") {
    AUTHORIZED_ADMIN_EMAIL = AUTHORIZED_ADMIN_EMAIL_CONFIG;
  }
  if (typeof APPS_SCRIPT_URL_CONFIG !== "undefined") {
    APPS_SCRIPT_URL = APPS_SCRIPT_URL_CONFIG;
  }
}

// 2. Auth State Listener
if (!isDemoMode) {
  auth.onAuthStateChanged((user) => {
    const loginContainer = document.getElementById("loginContainer");
    const adminPanel = document.getElementById("adminPanel");
    
    if (user) {
      if (user.email.toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
        loginContainer.classList.add("hidden");
        adminPanel.classList.remove("hidden");
        document.getElementById("user-email-badge").textContent = user.email;
        loadAllAdminData();
      } else {
        alert("Access Denied: Your account email is not authorized to edit this portfolio.");
        auth.signOut();
        showLoginScreen();
      }
    } else {
      showLoginScreen();
    }
  });
} else {
  // Demo Mode Init Check
  document.addEventListener("DOMContentLoaded", () => {
    const cachedUser = localStorage.getItem("trb_demo_user");
    if (cachedUser) {
      mockUser = JSON.parse(cachedUser);
      document.getElementById("loginContainer").classList.add("hidden");
      document.getElementById("adminPanel").classList.remove("hidden");
      document.getElementById("user-email-badge").textContent = `${mockUser.email} (DEMO)`;
      loadAllAdminData();
    } else {
      showLoginScreen();
    }
  });
}

// 3. UI Helpers
function showLoginScreen(errorMsg = "") {
  document.getElementById("loginContainer").classList.remove("hidden");
  document.getElementById("adminPanel").classList.add("hidden");
  
  const errDiv = document.getElementById("loginError");
  if (errorMsg) {
    errDiv.textContent = errorMsg;
    errDiv.classList.remove("hidden");
  } else {
    errDiv.classList.add("hidden");
  }
}

// 4. Sign In Handler
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const loginBtn = document.getElementById("loginBtn");
  const errDiv = document.getElementById("loginError");
  
  if (!email || !password) {
    errDiv.textContent = "Please provide both credentials.";
    errDiv.classList.remove("hidden");
    return;
  }
  
  loginBtn.disabled = true;
  loginBtn.textContent = "Verifying Credentials...";
  errDiv.classList.add("hidden");
  
  if (isDemoMode) {
    // Demonstration Sandbox Access
    setTimeout(() => {
      mockUser = { email: email };
      localStorage.setItem("trb_demo_user", JSON.stringify(mockUser));
      document.getElementById("loginContainer").classList.add("hidden");
      document.getElementById("adminPanel").classList.remove("hidden");
      document.getElementById("user-email-badge").textContent = `${email} (DEMO)`;
      loginBtn.disabled = false;
      loginBtn.textContent = "Verify Identity";
      loadAllAdminData();
      alert("Welcome to the Demonstration Dashboard! Edits will persist in your browser's localStorage.");
    }, 800);
  } else {
    try {
      await auth.signInWithEmailAndPassword(email, password);
      loginBtn.disabled = false;
      loginBtn.textContent = "Verify Identity";
    } catch (error) {
      console.error("Sign-in failure:", error);
      errDiv.textContent = error.message;
      errDiv.classList.remove("hidden");
      loginBtn.disabled = false;
      loginBtn.textContent = "Verify Identity";
    }
  }
});

// 5. Logout Handler
function logout() {
  if (isDemoMode) {
    mockUser = null;
    localStorage.removeItem("trb_demo_user");
    showLoginScreen();
  } else {
    auth.signOut();
  }
}

// 6. Token Retrieval for API Authentication
async function getFirebaseToken() {
  if (isDemoMode) {
    return "MOCK_JWT_CREDENTIALS";
  }
  const user = auth.currentUser;
  if (!user) throw new Error("No active user session.");
  return await user.getIdToken();
}

// 7. Base API Caller
async function callAppsScript(action, payload = {}) {
  if (isDemoMode) {
    return { success: false, reason: "demo_fallback" };
  }
  
  try {
    const firebaseToken = await getFirebaseToken();
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain" // Prevents CORS preflight precheck
      },
      body: JSON.stringify({ action, firebaseToken, ...payload })
    });
    
    if (!response.ok) {
      throw new Error(`API returned code ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Apps Script operational failure [Action: ${action}]:`, error);
    return { success: false, error: error.message };
  }
}

// 8. Load Dashboard Admin Datasets
async function loadAllAdminData() {
  if (isDemoMode) {
    blogPosts = JSON.parse(localStorage.getItem("trb_mock_posts"));
    galleryPhotos = JSON.parse(localStorage.getItem("trb_mock_gallery"));
    systemSettings = JSON.parse(localStorage.getItem("trb_mock_settings"));
    
    renderBlogPostsTable(blogPosts);
    renderGalleryTable(galleryPhotos);
    populateSettingsForm(systemSettings);
    return;
  }
  
  showTableLoaders();
  const response = await callAppsScript("getDashboardData");
  
  if (response && response.success) {
    blogPosts = response.data.blogPosts || [];
    galleryPhotos = response.data.gallery || [];
    
    // Parse settings
    if (response.data.metrics) {
      systemSettings = {
        marathonTitle: response.data.metrics.countdown?.title || "Next Marathon",
        marathonDate: convertDateStringtoHTMLDate(response.data.metrics.countdown?.dateString),
        weeklyTarget: response.data.metrics.weeklyVolume?.target || 80
      };
    }
    
    renderBlogPostsTable(blogPosts);
    renderGalleryTable(galleryPhotos);
    populateSettingsForm(systemSettings);
  } else {
    alert("Could not load backend data. Unconfigured properties? Running in Demo fallbacks.");
    isDemoMode = true;
    initializeDemoStorage();
    loadAllAdminData();
  }
}

// Helper to convert dynamic textual dates back to HTML input formats
function convertDateStringtoHTMLDate(str) {
  if (!str) return "";
  try {
    const dateObj = new Date(str);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split('T')[0];
  } catch (e) {
    return "";
  }
}

function showTableLoaders() {
  const spinnerHtml = `<tr>
    <td colspan="5" class="px-6 py-12 text-center text-slate-400">
      <div class="spinner-admin mx-auto mb-2"></div>
      <span>Synchronizing database files...</span>
    </td>
  </tr>`;
  document.getElementById("blog-table-body").innerHTML = spinnerHtml;
  document.getElementById("gallery-table-body").innerHTML = spinnerHtml;
}

// 9. Tab Swapper
function switchTab(tabName) {
  activeTab = tabName;
  
  const tabs = ["blog", "gallery", "settings"];
  tabs.forEach(t => {
    const content = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    
    if (t === tabName) {
      content.classList.remove("hidden");
      btn.className = "border-b-2 border-slate-900 py-5 px-1 text-sm font-bold text-slate-900 flex items-center gap-2";
    } else {
      content.classList.add("hidden");
      btn.className = "border-b-2 border-transparent py-5 px-1 text-sm font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 flex items-center gap-2";
    }
  });
}

// 10. Render Blog Posts Management Table
function renderBlogPostsTable(posts) {
  const tbody = document.getElementById("blog-table-body");
  
  if (posts.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="5" class="px-6 py-8 text-center text-slate-400 font-medium">No blog posts found. Draft your first above!</td>
    </tr>`;
    return;
  }
  
  tbody.innerHTML = "";
  
  posts.forEach((post) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-colors";
    
    tr.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono font-medium">${post.created_at || ""}</td>
      <td class="px-6 py-4 text-sm font-bold text-slate-900 cursor-pointer hover:bg-slate-100/50 rounded-lg transition-all" onclick="makeCellEditable(this, ${post.id}, 'title', '${escapeString(post.title)}')">${post.title}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-100/50 rounded-lg transition-all" onclick="makeCellEditable(this, ${post.id}, 'category', '${escapeString(post.category)}', true)">
        <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">${post.category}</span>
      </td>
      <td class="px-6 py-4 text-sm text-slate-500 max-w-xs truncate cursor-pointer hover:bg-slate-100/50 rounded-lg transition-all" onclick="makeCellEditable(this, ${post.id}, 'excerpt', '${escapeString(post.excerpt)}')">${post.excerpt}</td>
      <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
        <button onclick="handleDeletePost(${post.id})" class="text-red-500 hover:text-red-700 font-semibold transition-colors flex items-center gap-1 inline-flex"><i class="fa-regular fa-trash-can"></i> Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 11. Render Gallery Table
function renderGalleryTable(photos) {
  const tbody = document.getElementById("gallery-table-body");
  
  if (photos.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="5" class="px-6 py-8 text-center text-slate-400 font-medium">No moments uploaded yet. Drop an image above!</td>
    </tr>`;
    return;
  }
  
  // Sort photos locally by display order ascending
  photos.sort((a, b) => Number(a.display_order) - Number(b.display_order));
  
  tbody.innerHTML = "";
  
  photos.forEach((photo, index) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-colors";
    
    tr.innerHTML = `
      <td class="px-6 py-3 whitespace-nowrap text-sm text-slate-500">
        <img src="${photo.image_url}" class="h-10 w-14 object-cover rounded-lg border border-slate-200 shadow-sm" alt="Preview">
      </td>
      <td class="px-6 py-3 text-sm font-bold text-slate-900 cursor-pointer hover:bg-slate-100/50 rounded-lg transition-all" onclick="makeCellEditable(this, ${photo.id}, 'caption', '${escapeString(photo.caption)}', false, true)">${photo.caption || "View Moment"}</td>
      <td class="px-6 py-3 whitespace-nowrap text-sm font-mono font-bold text-slate-600 cursor-pointer hover:bg-slate-100/50 rounded-lg transition-all" onclick="makeCellEditable(this, ${photo.id}, 'display_order', ${photo.display_order}, false, false, true)">${photo.display_order}</td>
      <td class="px-6 py-3 whitespace-nowrap text-center text-sm font-medium">
        <div class="inline-flex rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button onclick="handleReorderPhoto(${photo.id}, 'up')" ${index === 0 ? "disabled" : ""} class="px-3 py-1.5 hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-colors border-r border-slate-200">
            <i class="fa-solid fa-chevron-up text-xs"></i>
          </button>
          <button onclick="handleReorderPhoto(${photo.id}, 'down')" ${index === photos.length - 1 ? "disabled" : ""} class="px-3 py-1.5 hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-colors">
            <i class="fa-solid fa-chevron-down text-xs"></i>
          </button>
        </div>
      </td>
      <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
        <button onclick="handleDeletePhoto(${photo.id}, '${photo.image_url}')" class="text-red-500 hover:text-red-700 font-semibold transition-colors flex items-center gap-1 inline-flex"><i class="fa-regular fa-trash-can"></i> Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Populate System Settings Controls
function populateSettingsForm(settings) {
  document.getElementById("settings-marathon-title").value = settings.marathonTitle || "";
  document.getElementById("settings-marathon-date").value = settings.marathonDate || "";
  document.getElementById("settings-weekly-target").value = settings.weeklyTarget || 80;
}

// 12. Complete Cell Inline Editing Module
function makeCellEditable(cell, recordId, field, currentValue, isCategorySelect = false, isGalleryCaption = false, isNumber = false) {
  // Guard if already editing
  if (cell.querySelector("input") || cell.querySelector("select")) return;
  
  cell.classList.add("bg-white", "ring-2", "ring-accent", "p-1");
  
  let inputElement;
  
  if (isCategorySelect) {
    inputElement = document.createElement("select");
    inputElement.className = "w-full p-1 bg-white border border-slate-300 rounded font-semibold text-xs text-slate-700";
    const cats = ["Race Report", "Gear", "Mindset", "Nutrition", "Update"];
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      opt.selected = c === currentValue;
      inputElement.appendChild(opt);
    });
  } else {
    inputElement = document.createElement("input");
    inputElement.type = isNumber ? "number" : "text";
    inputElement.value = currentValue;
    inputElement.className = "w-full p-1 border border-slate-300 rounded text-sm bg-white font-medium focus:outline-none";
  }

  cell.innerHTML = "";
  cell.appendChild(inputElement);
  inputElement.focus();

  let isCommitted = false;

  const commitChanges = async () => {
    if (isCommitted) return;
    isCommitted = true;
    
    const rawVal = inputElement.value.trim();
    const finalVal = isNumber ? Number(rawVal) : rawVal;
    
    if (finalVal === currentValue || finalVal === "") {
      restoreOriginalCell();
      return;
    }
    
    // UI optimistic render
    if (isCategorySelect) {
      cell.innerHTML = `<span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">${finalVal}</span>`;
    } else {
      cell.innerHTML = finalVal;
    }
    cell.classList.remove("ring-2", "ring-accent", "p-1");
    
    // Save request
    if (isGalleryCaption || isNumber) {
      await updateGalleryPhotoInline(recordId, field, finalVal);
    } else {
      await updateBlogPostInline(recordId, field, finalVal);
    }
  };

  const restoreOriginalCell = () => {
    if (isCategorySelect) {
      cell.innerHTML = `<span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">${currentValue}</span>`;
    } else {
      cell.innerHTML = currentValue;
    }
    cell.classList.remove("ring-2", "ring-accent", "p-1");
  };

  inputElement.addEventListener("blur", commitChanges);
  inputElement.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitChanges();
    if (e.key === "Escape") restoreOriginalCell();
  });
}

// 13. Blog CRUD Sub-controllers
async function handleCreatePost(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById("submit-post-btn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner-admin border-white border-t-slate-800"></div> Syncing...`;
  
  const post = {
    title: document.getElementById("post-title").value.trim(),
    category: document.getElementById("post-category").value,
    image_url: document.getElementById("post-image-url").value.trim(),
    excerpt: document.getElementById("post-excerpt").value.trim(),
    content: document.getElementById("post-content").value.trim(),
    created_at: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  };
  
  if (isDemoMode) {
    post.id = Date.now();
    blogPosts.unshift(post);
    localStorage.setItem("trb_mock_posts", JSON.stringify(blogPosts));
    alert("Demo Post drafted successfully!");
    renderBlogPostsTable(blogPosts);
    document.getElementById("blog-form").reset();
  } else {
    const result = await callAppsScript("createPost", { post });
    if (result && result.success) {
      alert("Article successfully synchronized with cloud database!");
      loadAllAdminData();
      document.getElementById("blog-form").reset();
    } else {
      alert("Failed to sync post. Verify Apps Script logs.");
    }
  }
  
  submitBtn.disabled = false;
  submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Publish to Public Log`;
}

async function updateBlogPostInline(postId, field, newValue) {
  if (isDemoMode) {
    const idx = blogPosts.findIndex(p => p.id === postId);
    if (idx !== -1) {
      blogPosts[idx][field] = newValue;
      localStorage.setItem("trb_mock_posts", JSON.stringify(blogPosts));
    }
  } else {
    const result = await callAppsScript("updatePost", { postId, updates: { [field]: newValue } });
    if (!result || !result.success) {
      alert("Cloud synch failed. Reverting.");
      loadAllAdminData();
    }
  }
}

async function handleDeletePost(postId) {
  if (!confirm("Are you confident you want to delete this blog post? This action is permanent!")) return;
  
  if (isDemoMode) {
    blogPosts = blogPosts.filter(p => p.id !== postId);
    localStorage.setItem("trb_mock_posts", JSON.stringify(blogPosts));
    renderBlogPostsTable(blogPosts);
  } else {
    const result = await callAppsScript("deletePost", { postId });
    if (result && result.success) {
      alert("Post purged successfully.");
      loadAllAdminData();
    } else {
      alert("Could not process purge request.");
    }
  }
}

// 14. Gallery CRUD Sub-controllers
async function handleUploadPhoto(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById("submit-gallery-btn");
  const fileInput = document.getElementById("gallery-file");
  const file = fileInput.files[0];
  
  if (!file) return;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner-admin border-white border-t-slate-800"></div> Compressing Image...`;
  
  const caption = document.getElementById("gallery-caption").value.trim();
  const order = Number(document.getElementById("gallery-order").value);
  
  try {
    // High-performance canvas reduction
    const base64Image = await compressImage(file, 1200);
    
    if (isDemoMode) {
      const newPhoto = {
        id: Date.now(),
        image_url: base64Image, // Local Base64 preview
        caption: caption,
        display_order: order,
        uploaded_at: new Date().toLocaleDateString()
      };
      
      galleryPhotos.push(newPhoto);
      localStorage.setItem("trb_mock_gallery", JSON.stringify(galleryPhotos));
      alert("Photo uploaded successfully in Demo Sandbox!");
      renderGalleryTable(galleryPhotos);
      document.getElementById("gallery-form").reset();
      document.getElementById("gallery-order").value = "10";
    } else {
      submitBtn.innerHTML = `<div class="spinner-admin border-white border-t-slate-800"></div> Uplinking to GitHub...`;
      const result = await callAppsScript("uploadPhoto", { imageBase64: base64Image, caption, displayOrder: order });
      
      if (result && result.success) {
        alert("Image resized, saved to GitHub CDN, and synchronized in Sheets!");
        loadAllAdminData();
        document.getElementById("gallery-form").reset();
        document.getElementById("gallery-order").value = "10";
      } else {
        alert(`Failed to save gallery photo: ${result.error || "Unknown server fault."}`);
      }
    }
  } catch (error) {
    console.error(error);
    alert(`File processing error: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Compress &amp; Upload (via GitHub)`;
  }
}

async function updateGalleryPhotoInline(photoId, field, newValue) {
  if (isDemoMode) {
    const idx = galleryPhotos.findIndex(p => p.id === photoId);
    if (idx !== -1) {
      galleryPhotos[idx][field] = newValue;
      localStorage.setItem("trb_mock_gallery", JSON.stringify(galleryPhotos));
      renderGalleryTable(galleryPhotos);
    }
  } else {
    const updates = { [field]: newValue };
    const result = await callAppsScript("updatePhoto", { photoId, updates });
    if (!result || !result.success) {
      alert("Failed to synchronize photo updates.");
      loadAllAdminData();
    }
  }
}

async function handleDeletePhoto(photoId, imageUrl) {
  if (!confirm("Are you confident you want to delete this gallery photo?")) return;
  
  if (isDemoMode) {
    galleryPhotos = galleryPhotos.filter(p => p.id !== photoId);
    localStorage.setItem("trb_mock_gallery", JSON.stringify(galleryPhotos));
    renderGalleryTable(galleryPhotos);
  } else {
    const result = await callAppsScript("deletePhoto", { photoId, imageUrl });
    if (result && result.success) {
      alert("Image purged successfully from CDNs & database sheets.");
      loadAllAdminData();
    } else {
      alert("Purge operation rejected.");
    }
  }
}

async function handleReorderPhoto(photoId, direction) {
  const currentIdx = galleryPhotos.findIndex(p => p.id === photoId);
  if (currentIdx === -1) return;
  
  let targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
  if (targetIdx < 0 || targetIdx >= galleryPhotos.length) return;
  
  // Swap display orders in memory
  const currentOrder = galleryPhotos[currentIdx].display_order;
  const targetOrder = galleryPhotos[targetIdx].display_order;
  
  // Simple order collision resolver
  if (currentOrder === targetOrder) {
    galleryPhotos[currentIdx].display_order = direction === 'up' ? targetOrder - 1 : targetOrder + 1;
  } else {
    galleryPhotos[currentIdx].display_order = targetOrder;
    galleryPhotos[targetIdx].display_order = currentOrder;
  }

  if (isDemoMode) {
    localStorage.setItem("trb_mock_gallery", JSON.stringify(galleryPhotos));
    renderGalleryTable(galleryPhotos);
  } else {
    // Generate order mapping for bulk updates
    const photoOrderMap = {};
    photoOrderMap[galleryPhotos[currentIdx].id] = galleryPhotos[currentIdx].display_order;
    photoOrderMap[galleryPhotos[targetIdx].id] = galleryPhotos[targetIdx].display_order;
    
    const result = await callAppsScript("reorderPhotos", { photoOrderMap });
    if (result && result.success) {
      loadAllAdminData();
    } else {
      alert("Could not commit ordering structure to sheets database.");
    }
  }
}

// 15. Settings & Actions Sub-controllers
async function handleUpdateSettings(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById("submit-settings-btn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner-admin border-white border-t-slate-800"></div> Saving...`;
  
  const settingsPayload = {
    marathonTitle: document.getElementById("settings-marathon-title").value.trim(),
    marathonDate: document.getElementById("settings-marathon-date").value,
    weeklyTarget: Number(document.getElementById("settings-weekly-target").value)
  };
  
  if (isDemoMode) {
    localStorage.setItem("trb_mock_settings", JSON.stringify(settingsPayload));
    alert("Demo Settings committed successfully!");
  } else {
    const result = await callAppsScript("updateSettings", { settings: settingsPayload });
    if (result && result.success) {
      alert("Target variables committed successfully!");
      loadAllAdminData();
    } else {
      alert("Settings commit failed.");
    }
  }
  
  submitBtn.disabled = false;
  submitBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Commit System Parameters`;
}

async function handleAdminStravaSync() {
  const syncBtn = document.getElementById("admin-sync-btn");
  const syncIcon = document.getElementById("admin-sync-icon");
  
  syncBtn.disabled = true;
  syncIcon.classList.add("fa-spin");
  
  if (isDemoMode) {
    setTimeout(() => {
      syncIcon.classList.remove("fa-spin");
      syncBtn.disabled = false;
      alert("Demo Mode Sync Triggered! Compound tokens checked and catalog synced.");
    }, 1000);
  } else {
    const result = await callAppsScript("syncStrava");
    syncIcon.classList.remove("fa-spin");
    syncBtn.disabled = false;
    
    if (result && result.success) {
      alert("Strava webhook pipelines triggered. Google Sheet rows successfully appended!");
      loadAllAdminData();
    } else {
      alert("Strava token synchronizer failed. Review log scripts.");
    }
  }
}

// 16. Client-Side Image Resizer/Compressor
function compressImage(file, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        // Output at high quality 85% JPEG to preserve detail while slashing size!
        const base64String = canvas.toDataURL("image/jpeg", 0.85);
        resolve(base64String);
      };
      
      img.onerror = (err) => reject(new Error("Failed to load image file into drawing canvas."));
    };
    
    reader.onerror = (err) => reject(new Error("Failed to read image data stream."));
  });
}

// Sandbox local collections initiator
function initializeDemoStorage() {
  if (!localStorage.getItem("trb_mock_posts")) {
    const initialPosts = [
      {
        id: 1,
        title: "Kathmandu Half Marathon: Risk Management at Mile 10",
        category: "Race Report",
        created_at: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        excerpt: "How breaking through the 15km wall taught me more about mitigating portfolio risk than a standard finance handbook ever could.",
        content: "<p>The Kathmandu Half Marathon is a test of structural endurance and dynamic agility...</p>",
        image_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&q=80&w=1200"
      },
      {
        id: 2,
        title: "The Compound Interest of Training Consistency",
        category: "Mindset",
        created_at: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        excerpt: "In wealth management, compounding builds fortunes. In marathon training, compounding miles builds champions. Here is the math.",
        content: "<p>Wealth is not built overnight; it is the product of continuous investment...</p>",
        image_url: "https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&q=80&w=1200"
      }
    ];
    localStorage.setItem("trb_mock_posts", JSON.stringify(initialPosts));
  }
  
  if (!localStorage.getItem("trb_mock_gallery")) {
    const initialPhotos = [
      { id: 1, image_url: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&q=80&w=800", caption: "High altitude single-track speedwork.", display_order: 10, uploaded_at: new Date().toLocaleDateString() },
      { id: 2, image_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&q=80&w=800", caption: "Kathmandu Half Marathon early morning takeoff.", display_order: 20, uploaded_at: new Date().toLocaleDateString() }
    ];
    localStorage.setItem("trb_mock_gallery", JSON.stringify(initialPhotos));
  }
  
  if (!localStorage.getItem("trb_mock_settings")) {
    localStorage.setItem("trb_mock_settings", JSON.stringify(systemSettings));
  }
}

// Utility for escaping special HTML quotes
function escapeString(str) {
  if (!str) return "";
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
