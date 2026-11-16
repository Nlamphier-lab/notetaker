document.addEventListener('DOMContentLoaded', () => {
  const lectureTitleInput = document.getElementById('lectureTitle');
  const apiKeyInput = document.getElementById('apiKey');
  const newBtn = document.getElementById('newBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const saveBtn = document.getElementById('saveBtn');
  const sessionList = document.getElementById('sessionList');
  const finalSpan = document.getElementById('finalTranscript');
  const interimSpan = document.getElementById('interimTranscript');
  const captionsBox = document.getElementById('captionsBox');
  const notesBox = document.getElementById('notesBox');
  const micStatus = document.getElementById('micStatus');
  const autoStatus = document.getElementById('autoStatus');

  // Verify the script actually loaded by updating the badge text on startup
  if (micStatus) {
    micStatus.textContent = 'Mic Ready';
  }

  let sessions = JSON.parse(localStorage.getItem('notetaker_sessions') || '[]');
  let currentSessionId = null;
  let isListening = false;
  let lastSummarizedLength = 0;
  let autoTimer = null;
  let recognition = null;

  apiKeyInput.value = localStorage.getItem('notetaker_apikey') || '';
  apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('notetaker_apikey', apiKeyInput.value.trim());
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micStatus.textContent = 'Browser Unsupported';
    micStatus.style.background = '#fee2e2';
    micStatus.style.color = '#991b1b';
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      micStatus.textContent = 'Listening...';
      micStatus.style.background = '#dcfce7';
      micStatus.style.color = '#166534';
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalSpan.textContent += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      interimSpan.textContent = interim;
      captionsBox.scrollTop = captionsBox.scrollHeight;
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      micStatus.style.background = '#fee2e2';
      micStatus.style.color = '#991b1b';
      micStatus.textContent = `Mic Error: ${event.error}`;
      if (event.error === 'not-allowed' || event.error === 'network' || event.error === 'audio-capture') {
        isListening = false;
        resetButtons();
      }
    };

    recognition.onend = () => {
      if (isListening) {
        setTimeout(() => {
          if (isListening) {
            try {
              recognition.start();
            } catch (e) {
              console.warn(e);
            }
          }
        }, 300);
      } else {
        resetButtons();
      }
    };
  }

  function resetButtons() {
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    clearInterval(autoTimer);
  }

  startBtn.addEventListener('click', () => {
    if (!recognition) {
      alert('Speech recognition is not supported in this browser. Please open in Google Chrome or Microsoft Edge.');
      return;
    }

    isListening = true;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    micStatus.textContent = 'Starting Mic...';
    micStatus.style.background = '#fef9c3';
    micStatus.style.color = '#854d0e';

    try {
      recognition.start();
    } catch (err) {
      micStatus.textContent = `Start Failed: ${err.message}`;
      micStatus.style.background = '#fee2e2';
      micStatus.style.color = '#991b1b';
    }

    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      const currentText = captionsBox.innerText.trim();
      if (currentText.length > lastSummarizedLength + 80 && apiKeyInput.value.trim()) {
        generateSmartNotes(true);
      }
    }, 60000);
  });

  stopBtn.addEventListener('click', () => {
    isListening = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn(e);
      }
    }
    resetButtons();
    micStatus.textContent = 'Mic Off';
    micStatus.style.background = '#f3f4f6';
    micStatus.style.color = '#4b5563';
  });

  async function generateSmartNotes(isAuto = false) {
    const transcript = captionsBox.innerText.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!transcript) {
      if (!isAuto) alert('No captions captured yet! Speak into your mic or click inside Live Captions to paste text.');
      return;
    }
    if (!apiKey) {
      if (!isAuto) alert('Please paste a Gemini API key in the top bar first.');
      return;
    }

    autoStatus.textContent = 'Updating notes...';
    if (!isAuto) {
      notesBox.innerHTML = '<p style="color:#6b7280;">Analyzing lecture and extracting key notes...</p>';
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a college study assistant. Read the following raw lecture transcript and create concise, structured study notes. Highlight key definitions, main concepts, and important takeaways using clean HTML (<h3>, <ul>, <li>, <strong>). Do NOT repeat the transcript word-for-word; synthesize only what matters for studying.\n\nTranscript:\n${transcript}`
            }]
          }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate notes.';
      notesBox.innerHTML = aiText.replace(/```html|```/g, '').trim();
      lastSummarizedLength = transcript.length;
      autoStatus.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      saveCurrentSession(true);
    } catch (err) {
      autoStatus.textContent = 'Update failed';
      if (!isAuto) {
        notesBox.innerHTML = `<p style="color:#ef4444;">Error: ${err.message}</p>`;
      }
    }
  }

  summarizeBtn.addEventListener('click', () => generateSmartNotes(false));

  function saveCurrentSession(silent = false) {
    const title = lectureTitleInput.value.trim() || `Lecture — ${new Date().toLocaleDateString()}`;
    const transcript = captionsBox.innerText.trim();
    const notes = notesBox.innerHTML;

    if (!transcript && !silent) {
      return alert('Nothing to save yet!');
    }

    if (currentSessionId) {
      const idx = sessions.findIndex(s => s.id === currentSessionId);
      if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], title, transcript, notes, updatedAt: new Date().toLocaleString() };
      }
    } else {
      currentSessionId = Date.now().toString();
      sessions.unshift({
        id: currentSessionId,
        title,
        transcript,
        notes,
        updatedAt: new Date().toLocaleString()
      });
    }

    localStorage.setItem('notetaker_sessions', JSON.stringify(sessions));
    renderSessionList();
    if (!silent) alert('Lecture saved!');
  }

  saveBtn.addEventListener('click', () => saveCurrentSession(false));

  newBtn.addEventListener('click', () => {
    currentSessionId = null;
    lectureTitleInput.value = '';
    finalSpan.textContent = '';
    interimSpan.textContent = '';
    lastSummarizedLength = 0;
    notesBox.innerHTML = '<p style="color: #6b7280;">Ready for a new lecture. Click "Start Listening" when class begins.</p>';
    renderSessionList();
  });

  function loadSession(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    currentSessionId = session.id;
    lectureTitleInput.value = session.title;
    finalSpan.textContent = session.transcript;
    interimSpan.textContent = '';
    notesBox.innerHTML = session.notes;
    lastSummarizedLength = session.transcript.length;
    renderSessionList();
  }

  function deleteSession(e, id) {
    e.stopPropagation();
    sessions = sessions.filter(s => s.id !== id);
    localStorage.setItem('notetaker_sessions', JSON.stringify(sessions));
    if (currentSessionId === id) newBtn.click();
    else renderSessionList();
  }

  function renderSessionList() {
    sessionList.innerHTML = '';
    if (sessions.length === 0) {
      sessionList.innerHTML = '<li style="color:#9ca3af; font-size:0.85rem;">No saved lectures yet.</li>';
      return;
    }

    sessions.forEach(s => {
      const li = document.createElement('li');
      li.className = `session-item ${s.id === currentSessionId ? 'active' : ''}`;
      li.onclick = () => loadSession(s.id);
      li.innerHTML = `
        <div class="session-info">
          <strong>${s.title}</strong>
          <small>${s.updatedAt}</small>
        </div>
        <button class="delete-btn" title="Delete">✕</button>
      `;
      li.querySelector('.delete-btn').onclick = (e) => deleteSession(e, s.id);
      sessionList.appendChild(li);
    });
  }

  renderSessionList();
});
