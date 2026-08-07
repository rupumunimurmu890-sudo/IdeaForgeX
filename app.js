const taskInput = document.getElementById("taskInput");
const askButton = document.getElementById("askButton");
const language = document.getElementById("language");

const loading = document.getElementById("loading");
const resultSection = document.getElementById("resultSection");
const resultText = document.getElementById("resultText");

const copyButton = document.getElementById("copyButton");
const shareButton = document.getElementById("shareButton");
const newButton = document.getElementById("newButton");

const charCount = document.getElementById("charCount");

taskInput.addEventListener("input", () => {
  charCount.textContent = `${taskInput.value.length} / 5000`;
});

document.querySelectorAll(".example").forEach(button => {
  button.addEventListener("click", () => {
    taskInput.value = button.textContent;
    taskInput.dispatchEvent(new Event("input"));
    taskInput.focus();
  });
});

askButton.addEventListener("click", async () => {

  const task = taskInput.value.trim();

  if (!task) {
    alert("Please tell us what you need help with.");
    return;
  }

  loading.classList.remove("hidden");
  resultSection.classList.add("hidden");

  askButton.disabled = true;

  try {

    const response = await fetch("/api/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        task,
        language: language.value
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    resultText.textContent = data.result;

    resultSection.classList.remove("hidden");

    resultSection.scrollIntoView({
      behavior: "smooth"
    });

  } catch (error) {

    alert(error.message);

  } finally {

    loading.classList.add("hidden");
    askButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {

  await navigator.clipboard.writeText(resultText.textContent);

  copyButton.textContent = "✅ Copied";

  setTimeout(() => {
    copyButton.textContent = "📋 Copy";
  }, 1500);
});

shareButton.addEventListener("click", async () => {

  const text = resultText.textContent;

  if (navigator.share) {

    await navigator.share({
      title: "My AI Result",
      text
    });

  } else {

    await navigator.clipboard.writeText(text);

    alert("Result copied. You can now share it.");
  }
});

newButton.addEventListener("click", () => {

  taskInput.value = "";
  charCount.textContent = "0 / 5000";

  resultSection.classList.add("hidden");

  taskInput.focus();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});
