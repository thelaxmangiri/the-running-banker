// script.js - The Running Banker

// Deployed Google Apps Script Web App URL
// User should replace this with their actual deployed web app URL from Google Apps Script.
let APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxsBvg7ZGT-wpQmwAb7zbdmPXL4ZeXp61kKfwGOOf6AMdDi-59eqUikenM0a5qddRUxLQ/exec"; 

// Global Application State
let monthlyChart = null;
let currentGalleryPage = 1;
const itemsPerPage = 20;
let galleryData = [];
let blogPostsData = [];
let activeLightboxIndex = -1;

// Beautiful Mock Fallback Data (loaded when API is unconfigured or offline)
const mockDashboardData = {
  metrics: {
    lastRun: {
      name: "Kathmandu Valley Ridge Run 🏃‍♂️🏔️",
      distance: "16.8 km",
      pace: "5:08 /km",
      duration: "1h 26m",
      dateString: "Yesterday"
    },
    weeklyVolume: {
      current: 58.4,
      target: 80,
      percentage: 73
    },
    ytdTotal: 1428,
    countdown: {
      title: "Kathmandu Marathon 🏅",
      dateString: "Oct 18, 2026",
      daysLeft: 153
    }
  },
  chartData: {
    labels: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"],
    datasets: [110, 145, 185, 160, 220, 260, 280]
  },
  gallery: [
    { id: 1, image_url: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&q=80&w=800", caption: "High altitude single-track speedwork." },
    { id: 2, image_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&q=80&w=800", caption: "Kathmandu Half Marathon early morning takeoff." },
    { id: 3, image_url: "https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&q=80&w=800", caption: "Gear check: Compounding miles require durable soles." },
    { id: 4, image_url: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&q=80&w=800", caption: "Recovery hike with family in the Himalayan foothills." },
    { id: 5, image_url: "https://images.unsplash.com/photo-1530143311094-34d807799e8f?auto=format&fit=crop&q=80&w=800", caption: "Tackling the steep climbs on Shivapuri ridge." },
    { id: 6, image_url: "https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&q=80&w=800", caption: "Sunset cooldown: 10 miles in the bank." }
  ],
  recentRuns: [
    { dateString: "May 20, 2026", name: "Kathmandu Valley Ridge Run 🏃‍♂️🏔️", distance: "16.8 km", pace: "5:08 /km", duration: "1h 26m" },
    { dateString: "May 18, 2026", name: "Tempo intervals - Ring Road", distance: "12.0 km", pace: "4:45 /km", duration: "57m" },
    { dateString: "May 16, 2026", name: "Easy Recovery Jog", distance: "8.5 km", pace: "6:10 /km", duration: "52m" },
    { dateString: "May 14, 2026", name: "Long Run Sunday", distance: "24.2 km", pace: "5:30 /km", duration: "2h 13m" }
  ],
  blogPosts: [
    {
      id: 101,
      title: "Kathmandu Half Marathon: Risk Management at Mile 10",
      category: "Race Report",
      created_at: "May 12, 2026",
      excerpt: "How breaking through the 15km wall taught me more about mitigating portfolio risk than a standard finance handbook ever could.",
      content: "<p>The Kathmandu Half Marathon is a test of structural endurance and dynamic agility. As a risk officer, I am trained to evaluate threats and manage exposure. On the road, risk takes the form of lactic acid buildup and cardiac pace management.</p><p>By mile 10, the gradient begins to demand compounding effort. I had to evaluate whether to sustain my current pace or buffer my reserves. The key to finishing strong in a race, much like navigating volatile markets, is knowing when to stay disciplined and avoid over-leveraging early resources. Conserving just 5% of energy allowed a massive negative split over the final 3 kilometers, resulting in a new personal record of 1:44:12.</p>",
      image_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&q=80&w=1200"
    },
    {
      id: 102,
      title: "The Compound Interest of Training Consistency",
      category: "Mindset",
      created_at: "April 28, 2026",
      excerpt: "In wealth management, compounding builds fortunes. In marathon training, compounding miles builds champions. Here is the math.",
      content: "<p>Wealth is not built overnight; it is the product of continuous investment over long-term Horizons. The same rules govern physical capital.</p><p>Running 10 kilometers once does not trigger cardiorespiratory adaptations. But running 40-50 kilometers per week, week after week, creates an exponential compounding curve. Capillary networks expand, mitochondrial density climbs, and lactate threshold shifts. In training, as in banking, the magic is in the compound interest of micro-habits. Skip one day and you miss out on interest; skip multiple weeks, and you default on your baseline goals.</p>",
      image_url: "https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&q=80&w=1200"
    },
    {
      id: 103,
      title: "Carbohydrate Loading: The Banker's Fuel Sheet",
      category: "Nutrition",
      created_at: "March 15, 2026",
      excerpt: "Optimizing glycogen reserves with precision. Ratios, electrolyte targets, and the actual mechanics of a three-day pre-race protocol.",
      content: "<p>Fueling a 42.2-kilometer race requires exact calculations. If you enter the arena under-fueled, you will suffer catastrophic insolvency at mile 20. This is what runners refer to as 'hitting the wall.'</p><p>My glycogen replenishment program begins 72 hours prior to the race. The target is clear: 8-10 grams of clean carbohydrates per glycemic weight. I treat this like balancing a ledger, tracking macronutrient intake down to the gram. The protocol combines complex high-density grains, liquid glucose supplements, and specific sodium-magnesium electrolyte balances to keep cellular hydration at peak levels. The results speak for themselves: zero gut distress and sustained power output from gun to tape.</p>",
      image_url: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&q=80&w=1200"
    }
  ]
};

// Global Translation Helper Function for Nepali Dates
function convertNepaliDateToEnglish(nepaliDateStr) {
  if (!nepaliDateStr) return "";
  
  let convertedStr = String(nepaliDateStr).trim();

  const numberMap = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
  };

  const monthMap = {
    'जनवरी': 'January', 'फेब्रुअरी': 'February', 'मार्च': 'March',
    'अप्रिल': 'April', 'मे': 'May', 'जुन': 'June',
    'जुलाई': 'July', 'अगस्ट': 'August', 'सेप्टेम्बर': 'September',
    'अक्टोबर': 'October', 'नोभेम्बर': 'November', 'डिसेम्बर': 'December'
  };

  for (let nepNum in numberMap) {
    let regex = new RegExp(nepNum, 'g');
    convertedStr = convertedStr.replace(regex, numberMap[nepNum]);
  }

  for (let nepMonth in monthMap) {
    let regex = new RegExp(nepMonth, 'g');
    convertedStr = convertedStr.replace(regex, monthMap[nepMonth]);
  }

  return convertedStr;
}

// 1. Primary API Caller (Using text/plain payload to avoid CORS preflight OPTIONS error)
async function callAppsScript(action, payload = {}) {
  if (APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID")) {
    console.warn("Apps Script URL is using the placeholder ID. Serving high-fidelity preview mock data.");
    return { success: false, reason: "placeholder_url" };
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({ action, ...payload })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP network error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Apps Script API call failed:", error);
    return { success: false, reason: "network_error", error: error.message };
  }
}

// 2. Fetch Dashboard Data
async function fetchDashboardData() {
  const result = await callAppsScript("getDashboardData");
  
  if (result && result.success) {
    console.log("Real-time data retrieved successfully from Apps Script Database!");
    return result.data;
  } else {
    console.log("Serving rich mock database for demonstration.");
    return mockDashboardData;
  }
}

// 3. Render Metrics
function renderMetrics(metrics) {
  const liveContent = document.getElementById("live-run-content");
  const liveLoader = document.getElementById("live-run-loader");
  const liveTime = document.getElementById("live-run-time");
  
  if (metrics.lastRun) {
    liveLoader.classList.add("hidden");
    liveContent.classList.remove("hidden");
    
    document.getElementById("live-run-title").textContent = metrics.lastRun.name || "Morning Training Log";
    document.getElementById("live-run-dist").textContent = metrics.lastRun.distance || "0 km";
    document.getElementById("live-run-pace").textContent = metrics.lastRun.pace || "--";
    document.getElementById("live-run-dur").textContent = metrics.lastRun.duration || "--";
    
    // Convert Live Feed Date String if needed
    liveTime.textContent = convertNepaliDateToEnglish(metrics.lastRun.dateString) || "Recently synced";
  } else {
    liveLoader.textContent = "No recent activities found on Strava.";
  }

  if (metrics.countdown) {
    document.getElementById("countdown-title").textContent = metrics.countdown.title || "Next Marathon";
    document.getElementById("countdown-days").textContent = metrics.countdown.daysLeft !== undefined ? metrics.countdown.daysLeft : "--";
    document.getElementById("countdown-date").textContent = convertNepaliDateToEnglish(metrics.countdown.dateString) || "Date unconfigured";
  }

  if (metrics.weeklyVolume) {
    const cur = parseFloat(metrics.weeklyVolume.current) || 0;
    const target = parseFloat(metrics.weeklyVolume.target) || 80;
    const percentage = Math.min(100, Math.round((cur / target) * 100));
    
    document.getElementById("weekly-ratio").textContent = `${cur.toFixed(1)} / ${target} km`;
    document.getElementById("weekly-progress-fill").style.width = `${percentage}%`;
    document.getElementById("weekly-status").textContent = percentage >= 100 
      ? "🎯 Weekly volume target achieved!" 
      : `${(target - cur).toFixed(1)} km left to reach target`;
  }

  if (metrics.ytdTotal !== undefined) {
    document.getElementById("ytd-distance").textContent = Number(metrics.ytdTotal).toLocaleString(undefined, { maximumFractionDigits: 1 });
    const currentYear = new Date().getFullYear();
    document.getElementById("ytd-updated").textContent = `Cumulative distance for ${currentYear}`;
  }
}

// 4. Render Monthly Chart (Chart.js)
function renderChart(labels, distances) {
  const ctx = document.getElementById('monthly-chart').getContext('2d');
  
  if (monthlyChart) {
    monthlyChart.destroy();
  }
  
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Monthly Distance (KM)',
        data: distances,
        backgroundColor: '#bef264',
        hoverBackgroundColor: '#a3e635',
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Inter', weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono' },
          displayColors: false,
          callbacks: {
            label: function(context) {
              return ` ${context.parsed.y} KM`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11, weight: 'semibold' }
          }
        },
        y: {
          grid: {
            color: '#334155',
            lineWidth: 0.5
          },
          border: {
            dash: [4, 4]
          },
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono', size: 10 }
          }
        }
      }
    }
  });
}

// 4.5. Render Recent Runs Table (CONVERSION APPLIED HERE)
function renderRecentRuns(runs) {
  const tbody = document.getElementById("recent-runs-table-body");
  
  if (!runs || runs.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="5" class="py-8 text-center text-slate-400">
        <i class="fa-solid fa-shoe-prints text-2xl mb-2 block text-slate-600"></i>
        <span class="text-xs">No recent activities logged on Strava.</span>
      </td>
    </tr>`;
    return;
  }
  
  tbody.innerHTML = "";
  
  runs.forEach(run => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-800/30 transition-colors duration-150";
    
    // We filter the dynamic string run.dateString through the translation helper
    const cleanEnglishDate = convertNepaliDateToEnglish(run.dateString);
    
    tr.innerHTML = `
      <td class="whitespace-nowrap py-3 pl-4 pr-3 text-xs font-semibold text-slate-400 sm:pl-0 font-mono">${cleanEnglishDate}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm font-bold text-slate-200">${run.name}</td>
      <td class="whitespace-nowrap px-3 py-3 text-sm font-bold text-accent font-mono">${run.distance}</td>
      <td class="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-400 font-mono">${run.pace}</td>
      <td class="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-400 font-mono">${run.duration}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 5. Render Gallery with Pagination
function renderGallery(items) {
  const container = document.getElementById("gallery-grid");
  const paginationContainer = document.getElementById("gallery-pagination");
  
  galleryData = items || [];
  
  if (galleryData.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400">
      <i class="fa-regular fa-image text-3xl mb-2 block"></i>
      <span>No photos uploaded to the gallery library yet.</span>
    </div>`;
    paginationContainer.classList.add("hidden");
    return;
  }
  
  const totalPages = Math.ceil(galleryData.length / itemsPerPage);
  
  if (currentGalleryPage > totalPages) currentGalleryPage = totalPages;
  if (currentGalleryPage < 1) currentGalleryPage = 1;
  
  const startIndex = (currentGalleryPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = galleryData.slice(startIndex, endIndex);
  
  container.innerHTML = "";
  
  paginatedItems.forEach((item, index) => {
    const globalIndex = startIndex + index;
    
    const card = document.createElement("div");
    card.className = "card-hover relative rounded-2xl overflow-hidden border border-slate-200/60 bg-white cursor-pointer shadow-sm group";
    card.onclick = () => openLightbox(globalIndex);
    
    card.innerHTML = `
      <div class="gallery-img-container">
        <img src="${item.image_url}" alt="Gallery photo" class="w-full h-full object-cover" loading="lazy">
        <div class="gallery-overlay absolute inset-0 flex flex-col justify-end p-4">
          <p class="text-white text-xs font-semibold line-clamp-2">${item.caption || "View Moment"}</p>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  
  if (totalPages > 1) {
    paginationContainer.classList.remove("hidden");
    document.getElementById("gallery-page-indicator").textContent = `Page ${currentGalleryPage} of ${totalPages}`;
    document.getElementById("gallery-prev-btn").disabled = currentGalleryPage === 1;
    document.getElementById("gallery-next-btn").disabled = currentGalleryPage === totalPages;
  } else {
    paginationContainer.classList.add("hidden");
  }
}

function prevGalleryPage() {
  if (currentGalleryPage > 1) {
    currentGalleryPage--;
    renderGallery(galleryData);
    document.getElementById("gallery").scrollIntoView({ behavior: 'smooth' });
  }
}

function nextGalleryPage() {
  const totalPages = Math.ceil(galleryData.length / itemsPerPage);
  if (currentGalleryPage < totalPages) {
    currentGalleryPage++;
    renderGallery(galleryData);
    document.getElementById("gallery").scrollIntoView({ behavior: 'smooth' });
  }
}

// 6. Lightbox Implementations
function openLightbox(index) {
  activeLightboxIndex = index;
  const item = galleryData[activeLightboxIndex];
  if (!item) return;

  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");

  lightboxImg.src = item.image_url;
  lightboxCaption.textContent = item.caption || "";
  lightbox.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeLightbox(event) {
  if (event.target.id === "lightbox" || 
      event.target.closest(".lightbox-close") || 
      event.key === "Escape") {
    
    const lightbox = document.getElementById("lightbox");
    lightbox.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    activeLightboxIndex = -1;
  }
}

function prevLightboxImage(event) {
  if (event) event.stopPropagation();
  if (activeLightboxIndex > 0) {
    activeLightboxIndex--;
    const item = galleryData[activeLightboxIndex];
    document.getElementById("lightbox-img").src = item.image_url;
    document.getElementById("lightbox-caption").textContent = item.caption || "";
  }
}

function nextLightboxImage(event) {
  if (event) event.stopPropagation();
  if (activeLightboxIndex < galleryData.length - 1) {
    activeLightboxIndex++;
    const item = galleryData[activeLightboxIndex];
    document.getElementById("lightbox-img").src = item.image_url;
    document.getElementById("lightbox-caption").textContent = item.caption || "";
  }
}

// 7. Render Blog Posts (CONVERSION APPLIED TO BLOG DATE)
function renderBlogPosts(posts) {
  const container = document.getElementById("blog-grid");
  blogPostsData = posts || [];
  
  if (blogPostsData.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400">
      <i class="fa-regular fa-folder-open text-3xl mb-2 block"></i>
      <span>No entries found in the training log yet.</span>
    </div>`;
    return;
  }
  
  container.innerHTML = "";
  
  blogPostsData.forEach((post) => {
    let badgeColor = "bg-slate-100 text-slate-700";
    if (post.category === "Race Report") badgeColor = "bg-red-50 text-red-600 border border-red-100";
    else if (post.category === "Gear") badgeColor = "bg-blue-50 text-blue-600 border border-blue-100";
    else if (post.category === "Mindset") badgeColor = "bg-purple-50 text-purple-600 border border-purple-100";
    else if (post.category === "Nutrition") badgeColor = "bg-green-50 text-green-600 border border-green-100";
    else if (post.category === "Update") badgeColor = "bg-yellow-50 text-yellow-600 border border-yellow-100";
    
    const card = document.createElement("div");
    card.className = "card-hover flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm";
    
    const cleanBlogDate = convertNepaliDateToEnglish(post.created_at);

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-4 mb-4">
          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeColor}">
            ${post.category || "General"}
          </span>
          <span class="text-xs font-semibold text-slate-400 font-mono">${cleanBlogDate}</span>
        </div>
        
        <h3 class="text-xl font-bold text-midnight line-clamp-2 leading-snug mb-3 hover:text-slate-700 transition-colors">
          ${post.title}
        </h3>
        
        <p class="text-sm text-slate-500 line-clamp-3 leading-relaxed mb-6">
          ${post.excerpt || ""}
        </p>
      </div>

      <div>
        <button class="w-full inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:text-midnight transition-colors py-2.5 px-4 text-xs font-bold text-slate-600 gap-1.5" onclick='openBlogModal(${JSON.stringify(post).replace(/'/g, "&apos;")})'>
          Read Full Entry <i class="fa-solid fa-chevron-right text-[10px]"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// 8. Open Blog Modal
function openBlogModal(post) {
  const modal = document.getElementById("blog-modal");
  
  document.getElementById("modal-post-title").textContent = post.title;
  document.getElementById("modal-post-date").textContent = `Published on ${convertNepaliDateToEnglish(post.created_at) || "Unspecified date"}`;
  
  const categoryBadge = document.getElementById("modal-post-category");
  categoryBadge.textContent = post.category || "General";
  
  categoryBadge.className = "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wider uppercase";
  if (post.category === "Race Report") categoryBadge.classList.add("bg-red-50", "text-red-600", "border", "border-red-100");
  else if (post.category === "Gear") categoryBadge.classList.add("bg-blue-50", "text-blue-600", "border", "border-blue-100");
  else if (post.category === "Mindset") categoryBadge.classList.add("bg-purple-50", "text-purple-600", "border", "border-purple-100");
  else if (post.category === "Nutrition") categoryBadge.classList.add("bg-green-50", "text-green-600", "border", "border-green-100");
  else categoryBadge.classList.add("bg-slate-100", "text-slate-700");

  const modalImg = document.getElementById("modal-post-img");
  if (post.image_url) {
    modalImg.src = post.image_url;
    modalImg.classList.remove("hidden");
  } else {
    modalImg.classList.add("hidden");
  }

  document.getElementById("modal-post-content").innerHTML = post.content || `<p>${post.excerpt}</p>`;
  
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeBlogModal(event) {
  if (event.target.id === "blog-modal" || 
      event.target.closest("button") || 
      event.key === "Escape") {
    
    document.getElementById("blog-modal").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }
}

// 9. Manual Strava Sync Button
async function syncStrava() {
  const syncBtn = document.getElementById("sync-strava-btn");
  const syncIcon = document.getElementById("sync-icon");
  
  syncBtn.disabled = true;
  syncIcon.classList.add("fa-spin");
  
  const result = await callAppsScript("syncStrava");
  
  syncIcon.classList.remove("fa-spin");
  syncBtn.disabled = false;
  
  if (result && result.success) {
    alert("Strava dashboard synced successfully!");
    loadAllData();
  } else {
    if (result && result.reason === "placeholder_url") {
      alert("Demonstration Mode: Simulating manual Strava connection token cycle and sync!");
    } else {
      alert("Failed to sync Strava. Please check Google Apps Script configuration logs.");
    }
  }
}

// 10. Load All Data (Initialization)
async function loadAllData() {
  const data = await fetchDashboardData();
  
  if (data) {
    renderMetrics(data.metrics);
    
    if (data.chartData && data.chartData.labels && data.chartData.datasets) {
      renderChart(data.chartData.labels, data.chartData.datasets);
    }
    
    if (data.recentRuns) {
      renderRecentRuns(data.recentRuns);
    } else {
      renderRecentRuns([]);
    }
    
    renderGallery(data.gallery);
    renderBlogPosts(data.blogPosts);
  }
}

// Event Listeners and Page Configurations
document.addEventListener("DOMContentLoaded", () => {
  loadAllData();

  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");
  
  mobileMenuBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("hidden");
  });

  document.querySelectorAll(".mobile-nav-link").forEach(link => {
    link.addEventListener("click", () => {
      mobileMenu.classList.add("hidden");
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox(e);
      closeBlogModal(e);
    } else if (e.key === "ArrowLeft" && activeLightboxIndex !== -1) {
      prevLightboxImage(e);
    } else if (e.key === "ArrowRight" && activeLightboxIndex !== -1) {
      nextLightboxImage(e);
    }
  });
});