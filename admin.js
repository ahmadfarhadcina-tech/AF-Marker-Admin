
import { supabase, signOutAdmin } from "./auth.js";

const allowedOrigin = "https://ahmadfarhadcina-tech.github.io";
const allowedPath = "/AF-Marker-Admin/";

if (
  location.origin !== allowedOrigin ||
  !location.pathname.startsWith(allowedPath)
) {
  document.body.innerHTML = `
    <main style="font-family:sans-serif;padding:24px">
      <h2>Unauthorized Domain</h2>
      <p>You are not allowed to access this admin panel on this host.</p>
    </main>
  `;
  throw new Error("Unauthorized domain");
}

const ADMIN_ID = "f4052f3f-b32a-4eb7-a9f8-5b6e4c7ffc7c";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  profiles: [],
  products: [],
  reports: [],
  comments: [],
  likes: [],
  wishlists: [],
  follows: [],
  commentLikes: [],
  snapshotChart: null,
  statusChart: null
};

const titles = {
  overview: "Overview",
  profiles: "Users & profiles",
  products: "Products",
  reports: "Reports",
  comments: "Comments",
  engagement: "Engagement"
};

const esc = (v = "") =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const date = (v) => v ? new Date(v).toLocaleDateString() : "—";
const money = (v) => v == null ? "—" : Number(v).toLocaleString();

const initials = (s) =>
  String(s || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0] || "")
    .join("")
    .toUpperCase() || "?";

function notice(msg, type = "success") {
  const n = $("#notice");
  if (!n) return;

  n.textContent = msg;
  n.className = `notice ${type}`;
  window.scrollTo({ top: 0, behavior: "smooth" });

  setTimeout(() => n.classList.add("hidden"), 5000);
}

function statusBadge(status) {
  const s = String(status || "active").toLowerCase();

  const cls = ["blocked", "rejected", "deleted", "banned"].includes(s)
    ? "blocked"
    : ["pending", "review"].includes(s)
      ? "pending"
      : ["inactive", "paused", "draft"].includes(s)
        ? "inactive"
        : "";

  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function table(headers, rows, empty = "No records found") {
  return rows.length
    ? `<table>
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>`
    : `<div class="empty">${empty}</div>`;
}

/* =========================
   AUTHENTICATION & INIT
========================= */

async function guardedInit() {
  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      location.replace("./index.html");
      return;
    }

    if (user.id !== ADMIN_ID) {
      await supabase.auth.signOut();
      location.replace("./index.html");
      return;
    }

    const adminEmail = $("#admin-email");
    const today = $("#today");

    if (adminEmail) {
      adminEmail.textContent = user.email || "Authorized administrator";
    }

    if (today) {
      today.textContent = new Date().toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }

    await loadAll();

    // Start automatic refresh only after admin authentication.
    if (!window.afMarketAutoRefresh) {
      window.afMarketAutoRefresh = setInterval(() => {
        if (!document.hidden) {
          loadAll();
        }
      }, 5000);
    }
  } catch (error) {
    notice(error.message || String(error), "error");
  }
}

/* =========================
   DATABASE LOADING
========================= */

async function fetchTable(tableName, columns = "*") {
  const { data, error } = await supabase
    .from(tableName)
    .select(columns);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  return data || [];
}

let isLoadingAll = false;

async function loadAll() {
  // Prevent overlapping requests.
  if (isLoadingAll) return;

  isLoadingAll = true;

  const refreshButton = $("#refresh");

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  try {
    const results = await Promise.allSettled([
      fetchTable("profiles"),
      fetchTable("products"),
      fetchTable("product_reports"),
      fetchTable("product_comments"),
      fetchTable("product_likes"),
      fetchTable("product_wishlists"),
      fetchTable("followers"),
      fetchTable("comment_likes")
    ]);

    const keys = [
      "profiles",
      "products",
      "reports",
      "comments",
      "likes",
      "wishlists",
      "follows",
      "commentLikes"
    ];

    const failures = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        state[keys[index]] = result.value;
      } else {
        // Preserve previously loaded data if a table fails.
        failures.push(
          result.reason?.message || String(result.reason)
        );
      }
    });

    renderAll();

    if (failures.length) {
      notice(
        "Some tables could not be loaded: " + failures.join(" | "),
        "error"
      );
    }
  } catch (error) {
    notice(error.message || String(error), "error");
  } finally {
    isLoadingAll = false;

    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

/* =========================
   DASHBOARD RENDERING
========================= */

function renderAll() {
  const stats = {
    "#stat-users": state.profiles.length,
    "#stat-products": state.products.length,
    "#stat-reports": state.reports.length,
    "#stat-comments": state.comments.length,
    "#stat-likes": state.likes.length,
    "#stat-wishlists": state.wishlists.length,
    "#stat-follows": state.follows.length,
    "#stat-comment-likes": state.commentLikes.length,
    "#users-nav-count": state.profiles.length,
    "#products-nav-count": state.products.length,
    "#reports-nav-count": state.reports.length
  };

  Object.entries(stats).forEach(([selector, value]) => {
    const element = $(selector);
    if (element) element.textContent = value;
  });

  renderCharts();
  renderRecent();
  renderProfiles();
  renderProducts();
  renderReports();
  renderComments();
  renderEngagement();
}

function renderCharts() {
  if (!window.Chart) return;

  const snapshotCanvas = $("#snapshot-chart");
  const statusCanvas = $("#status-chart");

  if (!snapshotCanvas || !statusCanvas) return;

  if (state.snapshotChart) {
    state.snapshotChart.destroy();
  }

  state.snapshotChart = new Chart(snapshotCanvas, {
    type: "bar",
    data: {
      labels: ["Users", "Products", "Reports", "Comments"],
      datasets: [{
        label: "Records",
        data: [
          state.profiles.length,
          state.products.length,
          state.reports.length,
          state.comments.length
        ],
        backgroundColor: [
          "#a8c4ff",
          "#c9b8ff",
          "#ffdca0",
          "#9fe4c2"
        ],
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 45
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#7c8799",
            font: { size: 10 }
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#929bad",
            font: { size: 10 }
          },
          grid: { color: "#f0f2f6" }
        }
      }
    }
  });

  const counts = {};

  state.products.forEach((product) => {
    const status = product.status || "active";
    counts[status] = (counts[status] || 0) + 1;
  });

  const labels = Object.keys(counts);

  const colors = [
    "#22ad7b",
    "#7697ef",
    "#f0b94f",
    "#b19aec",
    "#ed8c8c",
    "#9ba6b7"
  ];

  if (state.statusChart) {
    state.statusChart.destroy();
  }

  state.statusChart = new Chart(statusCanvas, {

function renderRecent() {
  const rows = [...state.products]
    .sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    )
    .slice(0, 5)
    .map((product) => `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar">${esc(initials(product.title))}</div>
            <div>
              <b>${esc(product.title || "Untitled product")}</b>
              <small>${esc(product.category || "Uncategorized")}</small>
            </div>
          </div>
        </td>
        <td>${money(product.price)}</td>
        <td>${statusBadge(product.status)}</td>
        <td>${date(product.created_at)}</td>
      </tr>
    `);

  const container = $("#recent-products");

  if (container) {
    container.innerHTML = table(
      ["Product", "Price", "Status", "Created"],
      rows,
      "No products yet."
    );
  }
}

/* =========================
   USERS & PROFILES
========================= */

function renderProfiles() {
  const search = $("#profiles-search");
  const query = (search?.value || "").toLowerCase();

  const data = state.profiles.filter((profile) =>
    [
      profile.full_name,
      profile.username,
      profile.city,
      profile.whatsapp,
      profile.bio
    ].some((value) =>
      String(value || "").toLowerCase().includes(query)
    )
  );

  const rows = data.map((profile) => `
    <tr>
      <td>
        <div class="user-cell">
          ${
            profile.avatar_url
              ? `<img class="user-avatar" src="${esc(profile.avatar_url)}" alt="">`
              : `<span class="user-avatar">${esc(initials(profile.full_name || profile.username))}</span>`
          }
          <div>
            <b>${esc(profile.full_name || "Unnamed user")}</b>
            <small>@${esc(profile.username || "no-username")}</small>
          </div>
        </div>
      </td>
      <td>${esc(profile.city || "—")}</td>
      <td>${esc(profile.whatsapp || "—")}</td>
      <td>${date(profile.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="action-btn" data-action="view-profile" data-id="${esc(profile.id)}">Details</button>
          <button class="action-btn" data-action="edit-profile" data-id="${esc(profile.id)}">Edit</button>
          <button class="action-btn delete" data-action="delete-profile" data-id="${esc(profile.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `);

  const container = $("#profiles-table");

  if (container) {
    container.innerHTML = table(
      ["User", "City", "WhatsApp", "Joined", "Actions"],
      rows
    );
  }
}

function editProfile(profile) {
  if (!profile) return;

  showModal(
    "Edit user profile",
    `<div class="modal-grid">
      ${input("full_name", "Full name", profile.full_name || "")}
      ${input("username", "Username", profile.username || "")}
      ${input("city", "City", profile.city || "")}
      ${input("whatsapp", "WhatsApp", profile.whatsapp || "")}
      ${input("avatar_url", "Avatar URL", profile.avatar_url || "", "url", { full: true })}
      ${input("bio", "Bio", profile.bio || "", "text", { full: true, textarea: true })}
    </div>
    <p class="help-note">
      Profile fields are updated in the existing profiles row.
      Authentication email/password are not changed from this form.
    </p>`,
    async (formData) => {
      const patch = {};

      [
        "full_name",
        "username",
        "city",
        "whatsapp",
        "avatar_url",
        "bio"
      ].forEach((key) => {
        patch[key] = formData.get(key) || null;
      });

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", profile.id);

      if (error) throw error;
    }
  );
}

function viewProfile(profile) {
  if (!profile) return;

  const fields = [
    ["Profile ID", profile.id],
    ["Full name", profile.full_name],
    ["Username", profile.username],
    ["City", profile.city],
    ["WhatsApp", profile.whatsapp],
    ["Bio", profile.bio],
    ["Created", date(profile.created_at)]
  ];

  const ownProducts = state.products.filter(
    (product) => product.seller_id === profile.id
  );

  showModal(
    "User profile details",
    `<div class="modal-grid">
      ${fields.map(([key, value]) => `
        <div class="field ${key === "Bio" ? "full" : ""}">
          <label>${esc(key)}</label>
          <div style="font-size:12px;line-height:1.6;overflow-wrap:anywhere">
            ${esc(value || "—")}
          </div>
        </div>
      `).join("")}
      <div class="field full">
        <label>Products (${ownProducts.length})</label>
        <div>${ownProducts.map((product) => esc(product.title)).join(", ") || "No products linked by seller_id."}</div>
      </div>
    </div>`,
    async () => {},
    "Close"
  );

  const submit = $("#modal-root")?.querySelector('[type="submit"]');

  if (submit) {
    submit.type = "button";
    submit.onclick = () => {
      $("#modal-root").innerHTML = "";
    };
  }
}

/* =========================
   PRODUCTS
========================= */

function renderProducts() {
  const search = $("#products-search");
  const query = (search?.value || "").toLowerCase();

  const data = state.products.filter((product) =>
    [
      product.title,
      product.category,
      product.city,
      product.description,
      product.status
    ].some((value) =>
      String(value || "").toLowerCase().includes(query)
    )
  );

  const rows = data.map((product) => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar">${esc(initials(product.title))}</div>
          <div>
            <b>${esc(product.title || "Untitled")}</b>
            <small>${esc(product.city || "No city")}</small>
          </div>
        </div>
      </td>
      <td>${money(product.price)}</td>
      <td>${esc(product.category || "—")}</td>
      <td>${statusBadge(product.status)}</td>
      <td>${date(product.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="action-btn" data-action="edit-product" data-id="${esc(product.id)}">Edit</button>
          <button class="action-btn delete" data-action="delete-product" data-id="${esc(product.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `);

  const container = $("#products-table");

  if (container) {
    container.innerHTML = table(
      ["Product", "Price", "Category", "Status", "Created", "Actions"],
      rows
    );
  }
}

const input = (name, label, value = "", type = "text", options = {}) =>
  `<div class="field ${options.full ? "full" : ""}">
    <label for="f-${name}">${esc(label)}</label>
    ${
      options.textarea
        ? `<textarea id="f-${name}" name="${name}">${esc(value)}</textarea>`
        : options.select
          ? `<select id="f-${name}" name="${name}">
              ${options.select.map((option) => `
                <option value="${esc(option)}" ${String(value) === option ? "selected" : ""}>
                  ${esc(option)}
                </option>
              `).join("")}
            </select>`
          : `<input
              id="f-${name}"
              name="${name}"
              type="${type}"
              value="${esc(value)}"
              ${options.required ? "required" : ""}
              ${options.step ? `step="${options.step}"` : ""}
            >`
    }
  </div>`;

function editProduct(product = {}) {
  const isEdit = !!product.id;

  showModal(
    isEdit ? "Edit product" : "Add product",
    `<div class="modal-grid">
      ${input("title", "Title", product.title || "", "text", { required: true })}
      ${input("price", "Price", product.price ?? "", "number", { required: true, step: "0.01" })}
      ${input("category", "Category", product.category || "")}
      ${input("city", "City", product.city || "")}
      ${input("status", "Status", product.status || "active", "text", {
        select: ["active", "inactive", "pending", "sold", "rejected"]
      })}
      ${input("condition", "Condition", product.condition || "")}
      ${input("stock", "Stock", product.stock ?? 1, "number", { step: "1" })}
      ${input("whatsapp", "WhatsApp", product.whatsapp || "")}
      ${input("image_url", "Main image URL", product.image_url || "", "url", { full: true })}
      ${input("description", "Description", product.description || "", "text", { full: true, textarea: true })}
    </div>
    <p class="help-note">
      For a new listing, seller ID is left empty unless you provide one.
      Ensure required columns and marketplace rules are respected.
    </p>`,
    async (formData) => {
      const patch = {
        title: formData.get("title"),
        price: Number(formData.get("price")),
        category: formData.get("category") || null,
        city: formData.get("city") || null,
        status: formData.get("status") || "active",
        condition: formData.get("condition") || null,
        stock: formData.get("stock") === ""
          ? null
          : Number(formData.get("stock")),
        whatsapp: formData.get("whatsapp") || null,
        image_url: formData.get("image_url") || null,
        description: formData.get("description") || null
      };

      const result = isEdit
        ? await supabase.from("products").update(patch).eq("id", product.id)
        : await supabase.from("products").insert(patch);

      if (result.error) throw result.error;
    },
    isEdit ? "Save product" : "Create product"
  );
}

/* =========================
   REPORTS
========================= */

function renderReports() {
  const rows = state.reports.map((report) => {
    const product = state.products.find(
      (item) => item.id === report.product_id
    );

    const user = state.profiles.find(
      (item) => item.id === report.user_id
    );

    return `
      <tr>
        <td>#${esc(report.id)}</td>
        <td>${esc(product?.title || report.product_id || "Unknown product")}</td>
        <td>${esc(user?.full_name || user?.username || report.user_id || "Unknown user")}</td>
        <td>${esc(report.reason || "—")}</td>
        <td>${date(report.created_at)}</td>
        <td>
          <div class="row-actions">
            <button class="action-btn" data-action="report-details" data-id="${esc(report.id)}">Details</button>
            <button class="action-btn delete" data-action="delete-report" data-id="${esc(report.id)}">Resolve / remove</button>
          </div>
        </td>
      </tr>
    `;
  });

  const container = $("#reports-table");

  if (container) {
    container.innerHTML = table(
      ["ID", "Product", "Reported by", "Reason", "Date", "Actions"],
      rows,
      "No reports. Nice!"
    );
  }
}

/* =========================
   COMMENTS
========================= */

function renderComments() {
  const search = $("#comments-search");
  const query = (search?.value || "").toLowerCase();

  const data = state.comments.filter((comment) =>
    String(comment.comment || "").toLowerCase().includes(query)
  );

  const rows = data.map((comment) => {
    const user = state.profiles.find(
      (item) => item.id === comment.user_id
    );

    const product = state.products.find(
      (item) => item.id === comment.product_id
    );

    return `
      <tr>
        <td>
          <div class="user-cell">
            <span class="user-avatar">${esc(initials(user?.full_name || user?.username))}</span>
            <div>
              <b>${esc(user?.full_name || user?.username || "Unknown user")}</b>
              <small>${esc(product?.title || "Unknown product")}</small>
            </div>
          </div>
        </td>
        <td>${esc(comment.comment || "")}</td>
        <td>${comment.rating == null ? "—" : esc(comment.rating)}</td>
        <td>${date(comment.created_at)}</td>
        <td>
          <button class="action-btn delete" data-action="delete-comment" data-id="${esc(comment.id)}">Delete</button>
        </td>
      </tr>
    `;
  });

  const container = $("#comments-table");

  if (container) {
    container.innerHTML = table(
      ["User / product", "Comment", "Rating", "Date", "Actions"],
      rows
    );
  }
}

/* =========================
   ENGAGEMENT
========================= */

function renderEngagement() {
  const sets = [
    ["Product likes", state.likes],
    ["Wishlists", state.wishlists],
    ["Followers", state.follows],
    ["Comment likes", state.commentLikes]
  ];

  const container = $("#engagement-tables");
  if (!container) return;

  container.innerHTML = sets.map(([title, rows]) => `
    <div class="engagement-card">
      <h4>${title} <span class="badge">${rows.length}</span></h4>
      <p>Showing up to 5 recent records.</p>
      <div class="table-wrap">
        ${table(
          ["Record", "Date"],
          rows.slice(0, 5).map((record) => `
            <tr>
              <td>
                ${esc(
                  record.product_id ||
                  record.comment_id ||
                  ((record.follower_id || "") + " → " + (record.following_id || "")) ||
                  record.id
                )}
              </td>
              <td>${date(record.created_at)}</td>
            </tr>
          `),
          "No records"
        )}
      </div>
    </div>
  `).join("");
}

/* =========================
   NAVIGATION
========================= */

function switchView(view) {
  $$(".view").forEach((element) => {
    element.classList.toggle("active", element.id === `view-${view}`);
  });

  $$(".nav-item").forEach((element) => {
    element.classList.toggle("active", element.dataset.view === view);
  });

  const pageTitle = $("#page-title");
  if (pageTitle) {
    pageTitle.textContent = titles[view] || "Overview";
  }

  $("#sidebar")?.classList.remove("open");
}

/* =========================
   MODALS
========================= */

function showModal(title, body, onSave, label = "Save changes") {
  const root = $("#modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button type="button" class="action-btn" data-close>✕</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button type="button" class="button button-light" data-close>Cancel</button>
          <button type="submit" class="button button-primary">${esc(label)}</button>
        </div>
      </form>
    </div>
  `;

  const form = root.querySelector("form");

  root.querySelectorAll("[data-close]").forEach((button) => {
    button.onclick = () => {
      root.innerHTML = "";
    };
  });

  root.querySelector(".modal-backdrop").onclick = (event) => {
    if (event.target.classList.contains("modal-backdrop")) {
      root.innerHTML = "";
    }
  };

  form.onsubmit = async (event) => {
    event.preventDefault();

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "Saving…";

    try {
      await onSave(new FormData(form));
      root.innerHTML = "";
      await loadAll();
      notice("Saved successfully.");
    } catch (error) {
      button.disabled = false;
      button.textContent = label;
      notice(error.message || String(error), "error");
    }
  };
}

/* =========================
   DELETE OPERATIONS
========================= */

async function removeRecord(tableName, id, label) {
  if (!confirm(`Delete this ${label}? This action cannot be undone.`)) {
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq("id", id);

  if (error) throw error;

  await loadAll();

  notice(`${label[0].toUpperCase() + label.slice(1)} deleted.`);
}

async function deleteProfile(id) {
  const profile = state.profiles.find(
    (item) => String(item.id) === String(id)
  );

  if (!profile) return;

  const related = state.products.filter(
    (product) => product.seller_id === profile.id
  ).length;

  if (!confirm(
    `Delete profile ${profile.full_name || profile.username || profile.id}?` +
    (related ? ` It has ${related} linked product(s).` : "") +
    " This may fail if database foreign-key rules prevent deletion. It does not delete the Auth account."
  )) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profile.id);

  if (error) throw error;

  await loadAll();

  notice("Profile deleted. Auth account, if any, was not deleted.");
}

/* =========================
   ACTION HANDLER
========================= */

async function actionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "view-profile") {
      viewProfile(state.profiles.find(
        (item) => String(item.id) === String(id)
      ));
    }

    if (action === "edit-profile") {
      editProfile(state.profiles.find(
        (item) => String(item.id) === String(id)
      ));
    }

    if (action === "delete-profile") {
      await deleteProfile(id);
    }

    if (action === "edit-product") {
      editProduct(state.products.find(
        (item) => String(item.id) === String(id)
      ));
    }

    if (action === "delete-product") {
      await removeRecord("products", id, "product");
    }

    if (action === "delete-report") {
      await removeRecord("product_reports", id, "report");
    }

    if (action === "delete-comment") {
      await removeRecord("product_comments", id, "comment");
    }

    if (action === "report-details") {
      const report = state.reports.find(
        (item) => String(item.id) === String(id)
      );

      if (!report) return;

      showModal(
        "Report details",
        `<div class="modal-grid">
          ${[
            ["Report ID", report.id],
            ["Product ID", report.product_id],
            ["User ID", report.user_id],
            ["Reason", report.reason],
            ["Created", date(report.created_at)]
          ].map(([key, value]) => `
            <div class="field">
              <label>${esc(key)}</label>
              <div style="font-size:12px;overflow-wrap:anywhere">
                ${esc(value || "—")}
              </div>
            </div>
          `).join("")}
        </div>`,
        async () => {},
        "Close"
      );

      const submit = $("#modal-root")?.querySelector('[type="submit"]');

      if (submit) {
        submit.type = "button";
        submit.onclick = () => {
          $("#modal-root").innerHTML = "";
        };
      }
    }
  } catch (error) {
    notice(error.message || String(error), "error");
  }
}

/* =========================
   THEME
========================= */

const themeToggle = $("#theme-toggle");

function applyTheme(theme) {
  const selectedTheme = theme === "dark" ? "dark" : "light";

  document.documentElement.setAttribute("data-theme", selectedTheme);

  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-pressed",
      String(selectedTheme === "dark")
    );

    themeToggle.setAttribute(
      "aria-label",
      selectedTheme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode"
    );
  }
}

let savedTheme = "light";

try {
  savedTheme = localStorage.getItem("af-market-theme") || "light";
} catch (error) {
  // Use default theme if storage is unavailable.
}

applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme =
      document.documentElement.getAttribute("data-theme");

    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);

    try {
      localStorage.setItem("af-market-theme", nextTheme);
    } catch (error) {
      // Theme still works for the current session.
    }
  });
}

/* =========================
   EVENT LISTENERS
========================= */

$("#main-nav")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");

  if (button) {
    switchView(button.dataset.view);
  }
});

document.addEventListener("click", actionClick);

$$("[data-goto]").forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.goto);
  });
});

// Manual refresh button.
$("#refresh")?.addEventListener("click", loadAll);

$("#profiles-reload")?.addEventListener("click", loadAll);
$("#reports-reload")?.addEventListener("click", loadAll);
$("#engagement-reload")?.addEventListener("click", loadAll);

$("#profiles-search")?.addEventListener("input", renderProfiles);
$("#products-search")?.addEventListener("input", renderProducts);
$("#comments-search")?.addEventListener("input", renderComments);

$("#add-product")?.addEventListener("click", () => editProduct());

$("#signout")?.addEventListener("click", async () => {
  try {
    await signOutAdmin();
  } finally {
    location.replace("./index.html");
  }
});

$("#menu-toggle")?.addEventListener("click", () => {
  $("#sidebar")?.classList.toggle("open");
});

// Initialize authentication and dashboard.
guardedInit();
