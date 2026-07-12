# Local Fine-Tuning Studio

Train your own private AI models on your Mac — no coding required.

Local Fine-Tuning Studio is an app that runs entirely on your own computer. You
can download small AI models, teach them from your own example conversations,
chat with the result, and export the finished model — all from a friendly
web page, and all without your data ever leaving your Mac.

---

## What you need

- **A Mac.** Any reasonably recent Mac works for exploring the app.
- **An Apple Silicon Mac (M1, M2, M3, M4...)** if you want to do *real*
  training. On other computers the app runs in a safe "simulation mode" so you
  can still try everything out.
- **About 10 minutes** for the first-time setup (later launches take seconds).

You do **not** need to install anything ahead of time. The start script takes
care of everything and doesn't ask for your password.

---

## Step 1 — Download the app

1. Go to this project's page on GitHub:
   **https://github.com/meugenialewis-cell/local-finetune-studio**
2. Click the green **Code** button near the top right.
3. Click **Download ZIP**.
4. When the download finishes, double-click the ZIP file in your Downloads
   folder. This creates a folder called `local-finetune-studio-main`.
5. (Optional but tidy) Drag that folder somewhere you'll find it again, like
   your **Documents** folder.

## Step 2 — Start the app

Inside the folder you just unzipped, find the file called:

> **Start Fine-Tuning Studio.command**

**Right-click it (or hold Control and click), choose "Open", then click
"Open" again** in the window that appears.

> **Why right-click?** The first time you open an app that didn't come from
> the App Store, macOS shows a security warning. Right-click → Open tells your
> Mac "I trust this." You only need to do this once — after the first time,
> you can just double-click it.

> **On newer versions of macOS** the warning may not offer an "Open" button at
> all. If that happens: open **System Settings → Privacy & Security**, scroll
> down, and click **"Open Anyway"** next to the message about the blocked
> file. Then open the file again.

A Terminal window will open and walk you through setup with friendly progress
messages. The first run downloads and prepares everything (a few minutes).
When it's ready, the app opens in your web browser automatically at
**http://localhost:3939**.

**Keep the Terminal window open while you use the app.** Closing it stops the
app (your models and chats are saved — nothing is lost).

If you have an Apple Silicon Mac, the script will offer to install the **MLX
training engine** (about 500 MB). Say yes (type `y` and press Return) if you
want real on-device training. You can always skip it and install later.

## Step 3 — Use it

- Pick a base model and download it
- Upload or curate example conversations to teach it
- Start a fine-tuning run and watch the progress live
- Chat with your fine-tuned model and compare it to the original
- Export the result when you're happy with it

## Starting it again later

Just open **Start Fine-Tuning Studio.command** again (double-click works from
now on). It skips the setup and starts in a few seconds.

---

## Troubleshooting

**"...can't be opened because it is from an unidentified developer" / "Apple could not verify..."**
That's the normal first-open warning. Right-click the file, choose **Open**,
then click **Open**. On newer macOS versions, go to **System Settings →
Privacy & Security** and click **Open Anyway**, then try again.

**The Terminal window opens and closes right away, or nothing happens.**
Open the **Terminal** app yourself (press Cmd+Space, type "Terminal", press
Return), then type `bash ` (with a space after it), drag the file `setup.sh`
from the app folder into the Terminal window, and press Return. This does the
same thing and shows any error message on screen.

**The browser didn't open by itself.**
Open your browser and go to **http://localhost:3939** while the Terminal
window is running.

**It says something is already using the port.**
The app is probably already running in another window — check for another
Terminal window, or just go to **http://localhost:3939**.

**Setup failed partway through.**
Check your internet connection and simply run it again — it picks up where it
left off. Details of what happened are saved in the hidden file
`.local-tools/setup.log` inside the app folder, which is useful if you ask
someone (or an AI assistant) for help.

**A popup asked me to install "command line developer tools".**
That's macOS offering to install Apple's free developer tools, which include
Python (needed for real training). Click **Install** if you want real
training, or **Cancel** to keep using the app in simulation mode — either
way, the app keeps working.

**Training says "simulated" even on my Mac.**
Real training needs two things: an Apple Silicon Mac (M1 or newer) and the MLX
engine. Install MLX by opening Terminal and running:
`python3 -m pip install --user mlx-lm huggingface_hub`
then stop and restart the app.

**Where is my stuff saved?**
Everything (downloaded models, datasets, training runs, chats, exports) lives
in the `artifacts/api-server/storage` folder inside the app folder. If you
ever re-download the app, copy that folder over to keep your work.

---

## For technical readers

This is a pnpm monorepo. The frontend (`artifacts/finetune-studio`) is React +
Vite; the backend (`artifacts/api-server`) is Express 5, bundled with esbuild.
Training, model downloads, chat, and export are performed by Python scripts in
`artifacts/api-server/scripts/` using [MLX](https://github.com/ml-explore/mlx)
when running on Apple Silicon with `mlx-lm` installed; otherwise the backend
transparently falls back to a simulation engine.

To run it manually:

```bash
pnpm install
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/finetune-studio run build
cd artifacts/api-server && PORT=3939 node dist/index.mjs
```

The server serves the built frontend and the JSON API from the same port.
State is persisted as JSON/JSONL files under `artifacts/api-server/storage/`
(no database required).
