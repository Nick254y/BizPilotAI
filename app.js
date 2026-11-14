const starterProjects = [
  { name: "Business website", description: "Plan and build an online presence.", status: "In progress" },
  { name: "Marketing plan", description: "Prepare content for a product launch.", status: "Planning" }
];

let projects = [...starterProjects];

const pageTitles = {
  overview: "Overview",
  projects: "Projects",
  assistant: "AI assistant",
  marketing: "Marketing",
  settings: "Settings"
};

const pages = document.querySelectorAll(".page");
const navLinks = document.querySelectorAll(".nav-link[data-page]");
const pageName = document.getElementById("pageName");
const sidebar = document.getElementById("sidebar");

function showPage(page) {
  pages.forEach(section => section.classList.remove("active-page"));
  const target = document.getElementById(`${page}Page`);
  if (target) target.classList.add("active-page");

  navLinks.forEach(link => {
    link.classList.toggle("active", link.dataset.page === page);
  });

  pageName.textContent = pageTitles[page] || "Overview";
  sidebar.classList.remove("open");
}

navLinks.forEach(link => {
  link.addEventListener("click", () => showPage(link.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

document.getElementById("menuButton").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

function renderProjects() {
  const markup = projects.map((project, index) => `
    <article class="project-item">
      <div class="project-symbol">${index + 1}</div>
      <div class="project-info">
        <strong>${escapeHTML(project.name)}</strong>
        <small>${escapeHTML(project.description || "No description added.")}</small>
      </div>
      <span class="project-status">${escapeHTML(project.status)}</span>
    </article>
  `).join("");

  document.getElementById("projectList").innerHTML = markup || `<p class="muted">No projects yet. Create your first project.</p>`;
  document.getElementById("allProjects").innerHTML = markup || `<p class="muted">No projects yet. Create your first project.</p>`;
  document.getElementById("projectCount").textContent = projects.length;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

const projectDialog = document.getElementById("projectDialog");

function openProjectDialog() {
  document.getElementById("projectForm").reset();
  projectDialog.showModal();
}

document.getElementById("newProjectButton").addEventListener("click", openProjectDialog);
document.getElementById("projectsNewButton").addEventListener("click", openProjectDialog);
document.getElementById("closeDialogButton").addEventListener("click", () => projectDialog.close());
document.getElementById("cancelDialogButton").addEventListener("click", () => projectDialog.close());

document.getElementById("projectForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.getElementById("projectName").value.trim();
  const description = document.getElementById("projectDescription").value.trim();
  if (!name) return;

  projects.unshift({ name, description, status: "Planning" });
  renderProjects();
  projectDialog.close();
});

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  document.getElementById("chatMessages").appendChild(message);
  message.scrollIntoView({ behavior: "smooth", block: "end" });
}

function demoReply(question) {
  const lower = question.toLowerCase();
  if (lower.includes("idea")) {
    return "Try a focused local service business. Start by choosing one customer problem, speaking to five potential customers, and testing a simple offer before spending money.";
  }
  if (lower.includes("checklist") || lower.includes("launch")) {
    return "Starter launch checklist:\n1. Define your target customer.\n2. Choose one clear product or service.\n3. Set a simple price.\n4. Prepare a basic website or social page.\n5. Ask early customers for feedback.";
  }
  if (lower.includes("description") || lower.includes("product")) {
    return "Product description template: Introduce the product, explain the main customer benefit, mention one or two useful features, and finish with a clear call to action. Add only claims you can verify.";
  }
  return "I can help you plan a business, organise a project or draft marketing content. Try asking for a business idea, a launch checklist or a product description. This is a sample reply; live AI will be connected later.";
}

document.getElementById("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = document.getElementById("chatInput");
  const question = input.value.trim();
  if (!question) return;

  addMessage(question, "user");
  input.value = "";
  window.setTimeout(() => addMessage(demoReply(question), "bot"), 250);
});

document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => {
    document.getElementById("chatInput").value = button.textContent;
    document.getElementById("chatForm").requestSubmit();
  });
});

document.getElementById("generateMarketing").addEventListener("click", () => {
  const name = document.getElementById("businessName").value.trim() || "Our business";
  const type = document.getElementById("marketingType").value;
  const output = document.getElementById("marketingOutput");

  const drafts = {
    "Social media caption": `${name} is here to make your day a little easier. Discover what we offer and tell us what you think. Get in touch to learn more!`,
    "Product description": `${name} is designed with your needs in mind. Highlight its most useful features, explain how it helps customers, and include accurate details before publishing.`,
    "Short advertisement": `Looking for something useful and reliable? Discover ${name}. Contact us today to learn more and see whether it is right for you.`
  };

  output.textContent = drafts[type];
});

document.getElementById("saveSettings").addEventListener("click", () => {
  const name = document.getElementById("workspaceName").value.trim();
  document.querySelector(".profile strong").textContent = name || "Your workspace";
  document.getElementById("settingsMessage").textContent = "Workspace name updated in this browser demo.";
});

renderProjects();
addMessage("Hello! I'm your BizPilot demo assistant. What would you like to work on?", "bot");