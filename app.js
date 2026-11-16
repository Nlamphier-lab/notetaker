document.addEventListener('DOMContentLoaded', () => {
  const lectureTitleInput = document.getElementById('lectureTitle');
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

  let sessions = [];
  try {
    sessions = JSON.parse(localStorage.getItem('notetaker_sessions') || '[]');
  } catch (e) {
    sessions = [];
  }

  let currentSessionId = null;
  let isListening = false;
  let lastSummarizedLength = 0;
  let autoTimer = null;
  let recognition = null;

  // 1. Attach Start Button FIRST so nothing above it can ever block the click
  if (startBtn) {
    startBtn.onclick = () => {
      if (!recognition) {
        micStatus.textContent = 'No Speech API';
        micStatus.style.background = '#fee2e2';
        micStatus.style.color = '#991b1b';
        alert('Speech recognition is not supported in this browser. Open in Google Chrome or Microsoft Edge.');
        return;
      }

      isListening = true;
      startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-block';
      micStatus.textContent = 'Starting Mic...';
      micStatus.style.background = '#fef9c3';
      micStatus.style.color = '#854d0e';

      try {
        recognition.start();
      } catch (err) {
        micStatus.textContent = `Start Error: ${err.message}`;
        micStatus.style.background = '#fee2e2';
        micStatus.style.color = '#991b1b';
      }

      clearInterval(autoTimer);
      autoTimer = setInterval(() => {
        const currentText = captionsBox.innerText.trim();
        if (currentText.length > lastSummarizedLength + 50) {
          generateSmartNotes(true);
        }
      }, 30000);
    };
  }

  // 2. Attach Stop Button
  if (stopBtn) {
    stopBtn.onclick = () => {
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
      if (captionsBox && captionsBox.innerText.trim()) {
        generateSmartNotes(true);
      }
    };
  }

  function resetButtons() {
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    clearInterval(autoTimer);
  }

  // 3. Safely initialize SpeechRecognition inside try/catch
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (micStatus) {
      micStatus.textContent = 'Browser Unsupported';
      micStatus.style.background = '#fee2e2';
      micStatus.style.color = '#991b1b';
    }
  } else {
    try {
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
            const cleaned = transcript.trim();
            if (cleaned) {
              const formatted = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
              finalSpan.textContent += (/[.!?]$/.test(formatted) ? formatted : formatted + '.') + ' ';
            }
          } else {
            interim += transcript;
          }
        }
        interimSpan.textContent = interim;
        captionsBox.scrollTop = captionsBox.scrollHeight;
      };

      recognition.onerror = (event) => {
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

      if (micStatus) micStatus.textContent = 'Mic Ready';
    } catch (initErr) {
      if (micStatus) {
        micStatus.textContent = `Init Error: ${initErr.message}`;
        micStatus.style.background = '#fee2e2';
        micStatus.style.color = '#991b1b';
      }
    }
  }

  // 4. Local Smart Note Extractor (No API key needed)
  function generateSmartNotes(isAuto = false) {
    const rawText = captionsBox.innerText.trim();

    if (!rawText) {
      if (!isAuto) alert('No captions captured yet! Speak into your mic or click inside Live Captions to paste text.');
      return;
    }

    const sentences = rawText
      .replace(/([.?!])\s*(?=[A-Z])/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(s => s.split(/\s+/).length >= 4);

    if (sentences.length === 0) {
      notesBox.innerHTML = `<p>${rawText}</p>`;
      return;
    }

    const stopWords = new Set([
      'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
      'his', 'from', 'they', 'say', 'her', 'she', 'will', 'one', 'all', 'would',
      'there', 'their', 'what', 'out', 'about', 'who', 'get', 'which', 'when',
      'make', 'can', 'like', 'time', 'just', 'know', 'take', 'into', 'your',
      'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
      'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
      'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want',
      'because', 'any', 'these', 'give', 'most', 'are', 'was', 'were', 'been',
      'has', 'had', 'does', 'did', 'going', 'really', 'very', 'things', 'thing'
    ]);

    const wordFreq = {};
    rawText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    const topTopics = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0].charAt(0).toUpperCase() + entry[0].slice(1));

    const definitions = [];
    const reminders = [];
    const scoredPoints = [];

    const defRegex = /\b(is defined as|refers to|means that|is a type of|is known as|is called)\b/i;
    const reminderRegex = /\b(exam|quiz|test|due|assignment|homework|remember|don't forget|important to note|takeaway)\b/i;
    const emphasisRegex = /\b(key|main|crucial|essential|primarily|therefore|in summary|for example|first|second|third|reason|causes|leads to)\b/i;

    sentences.forEach((sentence, index) => {
      if (defRegex.test(sentence)) {
        definitions.push(sentence);
      } else if (reminderRegex.test(sentence)) {
        reminders.push(sentence);
      } else {
        let score = 0;
        const words = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        words.forEach(w => {
          if (wordFreq[w]) score += wordFreq[w];
        });
        score = score / Math.sqrt(words.length);
        if (emphasisRegex.test(sentence)) score += 3;
        if (index === 0) score += 1.5;

        scoredPoints.push({ sentence, score, index });
      }
    });

    const mainPoints = scoredPoints
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .sort((a, b) => a.index - b.index)
      .map(item => item.sentence);

    let html = '';

    if (topTopics.length > 0) {
      html += `<h3>📌 Key Topics</h3><p><strong>${topTopics.join(' • ')}</strong></p>`;
    }

    if (definitions.length > 0) {
      html += `<h3>📖 Key Definitions</h3><ul>`;
      definitions.forEach(def => {
        const highlighted = def.replace(/^([^,]+?)(\s+(?:is defined as|refers to|means that|is a type of|is known as|is called)\b)/i, '<strong>$1</strong>$2');
        html += `<li>${highlighted}</li>`;
      });
      html += `</ul>`;
    }

    if (mainPoints.length > 0) {
      html += `<h3>💡 Main Lecture Takeaways</h3><ul>`;
      mainPoints.forEach(pt => {
        html += `<li>${pt}</li>`;
      });
      html += `</ul>`;
    }

    if (reminders.length > 0) {
      html += `<h3>⚠️ Exam & Action Reminders</h3><ul>`;
      reminders.forEach(rem => {
        html += `<li><strong>${rem}</strong></li>`;
      });
      html += `</ul>`;
    }

    notesBox.innerHTML = html || `<p>${rawText}</p>`;
    lastSummarizedLength = rawText.length;
    if (autoStatus) {
      autoStatus.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    saveCurrentSession(true);
  }

  if (summarizeBtn) {
    summarizeBtn.onclick = () => generateSmartNotes(false);
  }

  function saveCurrentSession(silent = false) {
    const title = (lectureTitleInput && lectureTitleInput.value.trim()) || `Lecture — ${new Date().toLocaleDateString()}`;
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

  if (saveBtn) {
    saveBtn.onclick = () => saveCurrentSession(false);
  }

  if (newBtn) {
    newBtn.onclick = () => {
      currentSessionId = null;
      if (lectureTitleInput) lectureTitleInput.value = '';
      if (finalSpan) finalSpan.textContent = '';
      if (interimSpan) interimSpan.textContent = '';
      lastSummarizedLength = 0;
      if (notesBox) {
        notesBox.innerHTML = '<p style="color: #6b7280;">Ready for a new lecture. Click "Start Listening" when class begins.</p>';
      }
      renderSessionList();
    };
  }

  function loadSession(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    currentSessionId = session.id;
    if (lectureTitleInput) lectureTitleInput.value = session.title;
    if (finalSpan) finalSpan.textContent = session.transcript;
    if (interimSpan) interimSpan.textContent = '';
    if (notesBox) notesBox.innerHTML = session.notes;
    lastSummarizedLength = session.
