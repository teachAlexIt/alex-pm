import { sha256 } from "./sha256.js";
import { encryptString, decryptString } from "./cryptoStrings.js";


const connectionDiv = document.querySelector('#connectionDiv')
const chatNameInput = document.querySelector('#chatNameInput')
const userNameInput = document.querySelector('#userNameInput')
const connectButton = document.querySelector('#connectButton')
const disconnectButton = document.querySelector('#disconnectButton')
const chatListDiv = document.querySelector('#chatListDiv')
const messageTextarea = document.querySelector('#messageTextarea')
const sendMessageButton = document.querySelector('#sendMessageButton')
const sendingMessageDiv = document.querySelector('#sendingMessageDiv')

const currentConnectionData = {
    key: '',
    userName: '',
    chatNameSHA: '',
    userNameSHA: '',
    messagesList: []
}


connectButton.addEventListener('click', async () => {
    const chatName = chatNameInput.value.trim();
    const userName = userNameInput.value.trim();
    if (!chatName || !userName) {
        console.log('нет чата или имени');
        return
    }
    const connectData = {
        connectDataChatName: await sha256(chatName),
        connectDataUserName: await encryptString(chatName, userName),
    }
    console.log(connectData);
    console.log(`расшифровка${await decryptString(chatName, connectData.connectDataUserName)}`);

    try {
        const res = await fetch(
            "https://chat-api.iteacher-alex.org/api/connect",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(connectData),
            }
        );

        if (!res.ok) {
            throw new Error(`HTTP error ${res.status}`);
        }

        const data = await res.json();

        currentConnectionData.key = chatName;
        currentConnectionData.userName = userName;
        currentConnectionData.chatNameSHA = connectData.connectDataChatName;
        currentConnectionData.userNameSHA = connectData.connectDataUserName;
        currentConnectionData.messagesList = data.messagesList;

        await renderMessages();
        startWaiting();


        // messagesList от сервера
        console.log("messagesList:", data.messagesList);

        // пример расшифровки имени
        for (const msg of data.messagesList) {
            const user = await decryptString(chatName, msg.messageName);
            console.log(user, msg.messageDate);
        }

    } catch (err) {
        console.error("Ошибка подключения к чату:", err);
        alert("Не удалось подключиться к чату. Попробуйте позже.");
    }

})


async function renderMessages() {
    chatListDiv.innerHTML = ""; // очистка перед рендером

    for (const chatItem of currentConnectionData.messagesList) {
        // расшифровываем имя автора
        const author = await decryptString(currentConnectionData.key, chatItem.messageName);

        // текст сообщения
        const text = chatItem.messageText === ''
            ? `👋 ${author} подключился к чату!`
            : `${await decryptString(currentConnectionData.key, chatItem.messageText)}`;

        // определяем, от кого сообщение
        const isFromMe = author === currentConnectionData.userName;

        // контейнер сообщения
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${isFromMe ? 'message_from-me' : 'message_for-me'}`;

        // формируем HTML строго по структуре
        messageDiv.innerHTML = `
        <h3>${author}</h3>
        <p>${text}</p>
        <span>${formatDate(chatItem.messageDate)}</span>
    `;

        chatListDiv.appendChild(messageDiv);
    }
    // автоскролл вниз
    chatListDiv.scrollTop = chatListDiv.scrollHeight;
    chatListDiv.style.display = 'flex';
    disconnectButton.style.display = 'block';
    sendingMessageDiv.style.display = 'flex';
    connectionDiv.style.display = 'none';



}

function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

async function waitingUpdate() {
    const payload = {
        chatName: currentConnectionData.chatNameSHA,                 // SHA чата!
        messagesListLength: currentConnectionData.messagesList.length
    };

    try {
        const res = await fetch("https://chat-api.iteacher-alex.org/api/waitingUpdatect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // если 10 минут без изменений — просто запускаем снова
        if (data.noUpdates === true) {
            return waitingUpdate();
        }

        // если есть изменения — обновляем список и рендерим
        if (data.noUpdates === false && Array.isArray(data.messagesList)) {
            currentConnectionData.messagesList = data.messagesList;
            await renderMessages();
        }

        // продолжаем слушать
        return waitingUpdate();

    } catch (err) {
        console.error("waitingUpdate error:", err);
        // если временно сеть/сервер — подождать и повторить
        await new Promise(r => setTimeout(r, 2000));
        return waitingUpdate();
    }
}


let waitingStarted = false;

function startWaiting() {
    if (waitingStarted) return;
    waitingStarted = true;
    waitingUpdate();
}




sendMessageButton.addEventListener('click', async () => {
    const message = messageTextarea.value.trim();
    if (!message) return;

    const messageData = {
        connectDataChatName: currentConnectionData.chatNameSHA,
        connectDataUserName: currentConnectionData.userNameSHA,
        connectDatamessageText: await encryptString(currentConnectionData.key, message),
    };

    try {
        const res = await fetch("https://chat-api.iteacher-alex.org/api/sendMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(messageData),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        messageTextarea.value = '';
        // // обновляем список и рендерим
        // if (Array.isArray(data.messagesList)) {
        //     currentConnectionData.messagesList = data.messagesList;
        //     await renderMessages();
        // }

        // // очищаем поле
        // messageTextarea.value = "";

    } catch (err) {
        console.error("sendMessage error:", err);
        alert("Сообщение не отправлено. Попробуйте ещё раз.");
    }
});


