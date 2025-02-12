// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDG1wZMBobltVFJ1SR_mDbt8INiw3ZxVdQ",
    projectId: "mupho-ee0c0",
    authDomain: "mupho-ee0c0.firebaseapp.com",
    databaseURL: "https://mupho-ee0c0-default-rtdb.firebaseio.com"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const provider = new firebase.auth.GoogleAuthProvider();

// Variables globales
let currentPhotoUrl = null;
let currentAudioUrl = null;
let currentUser = null;

// Configuración de Cloudinary
const cloudinaryConfig = {
    cloudName: 'ddmi89zwa',
    uploadPreset: 'mupho_preset',
    folder: 'mupho'
};
// Elementos DOM
const modal = document.getElementById('uploadModal');
const createPostButton = document.getElementById('createPost');
const closeModal = document.querySelector('.close-modal');
const publishButton = document.getElementById('publishPost');
const uploadProgress = document.querySelector('.upload-progress');

// Event Listeners para el modal
createPostButton.addEventListener('click', () => {
    modal.style.display = 'flex';
    resetUploadForm();
});

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Funciones de utilidad
function resetUploadForm() {
    currentPhotoUrl = null;
    currentAudioUrl = null;
    document.getElementById('postTitle').value = '';
    document.getElementById('preview').innerHTML = '';
    publishButton.disabled = true;
    uploadProgress.style.display = 'none';
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.style.display = 'block';
    errorMessage.textContent = message;
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Configuración de widgets de Cloudinary
const photoWidget = cloudinary.createUploadWidget(
    {
        ...cloudinaryConfig,
        sources: ['local', 'camera'],
        maxFiles: 1,
        maxFileSize: 5000000,
        acceptedFiles: 'image/*'
    },
    handleUpload
);

const audioWidget = cloudinary.createUploadWidget(
    {
        ...cloudinaryConfig,
        sources: ['local'],
        maxFiles: 1,
        maxFileSize: 10000000,
        acceptedFiles: 'audio/*'
    },
    handleUpload
);

document.getElementById('uploadPhoto').addEventListener('click', () => {
    photoWidget.open();
});

document.getElementById('uploadAudio').addEventListener('click', () => {
    audioWidget.open();
});

function handleUpload(error, result) {
    if (error) {
        showError('Error al subir el archivo: ' + error.message);
        return;
    }

    if (result.event === "success") {
        const url = result.info.secure_url;
        uploadProgress.style.display = 'block';
        
        if (result.info.resource_type === 'image') {
            currentPhotoUrl = url;
            uploadProgress.textContent = 'Foto subida correctamente';
            document.getElementById('preview').innerHTML = `<img src="${url}" style="max-width: 300px;">`;
        } else if (result.info.resource_type === 'video') {
            currentAudioUrl = url;
            uploadProgress.textContent = 'Audio subido correctamente';
            document.getElementById('preview').innerHTML += `<audio controls src="${url}"></audio>`;
        }
        
        if (currentPhotoUrl && currentAudioUrl) {
            publishButton.disabled = false;
            uploadProgress.textContent = '¡Listo para publicar!';
        }
    }
}

// Event Listeners para autenticación
document.getElementById('loginButton').addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(error => {
        showError('Error al iniciar sesión: ' + error.message);
    });
});

document.getElementById('logout').addEventListener('click', () => {
    auth.signOut().catch(error => {
        showError('Error al cerrar sesión: ' + error.message);
    });
});

// Manejador de estado de autenticación
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('userInfo').innerHTML = `
            <img src="${user.photoURL}" alt="Usuario">
            <span>Bienvenido, ${user.displayName}</span>
        `;
        loadPosts();
    } else {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('userInfo').innerHTML = '';
    }
});

// Funciones para manejar likes
function handleLike(postId) {
    if (!currentUser) return;
    
    const likeRef = database.ref(`likes/${postId}/${currentUser.uid}`);
    const postLikesCountRef = database.ref(`posts/${postId}/likesCount`);
    
    likeRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                // Usuario ya dio like, entonces lo quitamos
                return Promise.all([
                    likeRef.remove(),
                    postLikesCountRef.transaction(count => (count || 1) - 1)
                ]);
            } else {
                // Usuario no ha dado like, lo añadimos
                return Promise.all([
                    likeRef.set(true),
                    postLikesCountRef.transaction(count => (count || 0) + 1)
                ]);
            }
        })
        .catch(error => showError('Error al procesar like: ' + error.message));
}

// Función para manejar comentarios
function handleComment(postId, commentText) {
    if (!currentUser || !commentText.trim()) return;
    
    const comment = {
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userPhoto: currentUser.photoURL,
        text: commentText.trim(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    database.ref(`comments/${postId}`).push(comment)
        .then(() => {
            // Actualizar contador de comentarios
            return database.ref(`posts/${postId}/commentsCount`)
                .transaction(count => (count || 0) + 1);
        })
        .catch(error => showError('Error al publicar comentario: ' + error.message));
}

// Publicar post
publishButton.addEventListener('click', () => {
    const title = document.getElementById('postTitle').value.trim();
    if (!title) {
        showError('Por favor, añade un título a tu publicación');
        return;
    }

    if (currentPhotoUrl && currentAudioUrl) {
        const post = {
            title: title,
            photoUrl: currentPhotoUrl,
            audioUrl: currentAudioUrl,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            userPhoto: currentUser.photoURL,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            likesCount: 0,
            commentsCount: 0
        };

        database.ref('posts').push(post)
            .then(() => {
                modal.style.display = 'none';
                resetUploadForm();
            })
            .catch(error => {
                showError('Error al publicar: ' + error.message);
            });
    }
});

// Cargar posts
function loadPosts() {
    const postsRef = database.ref('posts');
    postsRef.on('value', async (snapshot) => {
        const postsContainer = document.getElementById('posts');
        postsContainer.innerHTML = '';
        
        const posts = [];
        snapshot.forEach((childSnapshot) => {
            posts.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });

        posts.sort((a, b) => b.timestamp - a.timestamp);

        for (const post of posts) {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            
            // Verificar si el usuario actual dio like
            let userLiked = false;
            if (currentUser) {
                const likeSnapshot = await database.ref(`likes/${post.id}/${currentUser.uid}`).once('value');
                userLiked = likeSnapshot.exists();
            }
            
            postElement.innerHTML = `
                <div class="post-header">
                    <img src="${post.userPhoto}" alt="${post.userName}">
                    <div>
                        <div>${post.userName}</div>
                        <div class="post-date">${new Date(post.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div class="post-title">${post.title}</div>
                <img src="${post.photoUrl}" alt="${post.title}">
                <audio controls src="${post.audioUrl}"></audio>
                <div class="post-actions">
                    <button class="action-button ${userLiked ? 'liked' : ''}" onclick="handleLike('${post.id}')">
                        <i class="fas fa-heart"></i>
                        <span>${post.likesCount || 0}</span>
                    </button>
                    <button class="action-button" onclick="document.querySelector('#comment-input-${post.id}').focus()">
                        <i class="fas fa-comment"></i>
                        <span>${post.commentsCount || 0}</span>
                    </button>
                </div>
                <div class="comments-section">
                    <form class="comment-form" onsubmit="event.preventDefault(); handleComment('${post.id}', this.querySelector('input').value); this.querySelector('input').value = '';">
                        <input type="text" id="comment-input-${post.id}" class="comment-input" placeholder="Añade un comentario...">
                    </form>
                    <div id="comments-${post.id}"></div>
                </div>
            `;
            
            postsContainer.appendChild(postElement);
            loadComments(post.id);
        }
    });
}

// Cargar comentarios
function loadComments(postId) {
    const commentsRef = database.ref(`comments/${postId}`);
    commentsRef.on('value', (snapshot) => {
        const commentsContainer = document.getElementById(`comments-${postId}`);
        commentsContainer.innerHTML = '';
        
        const comments = [];
        snapshot.forEach((childSnapshot) => {
            comments.push(childSnapshot.val());
        });
        
        comments.sort((a, b) => b.timestamp - a.timestamp);
        
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `
                <img src="${comment.userPhoto}" alt="${comment.userName}">
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${comment.userName}</span>
                        <span class="comment-date">${new Date(comment.timestamp).toLocaleString()}</span>
                    </div>
                    <div>${comment.text}</div>
                </div>
            `;
            commentsContainer.appendChild(commentElement);
        });
    });
}

// Funcionalidad del menú móvil
document.addEventListener('DOMContentLoaded', () => {
    const mobileButton = document.createElement('button');
    mobileButton.className = 'mobile-menu-button';
    mobileButton.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.appendChild(mobileButton);

    const sidebar = document.querySelector('.sidebar');

    mobileButton.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar') && 
            !e.target.closest('.mobile-menu-button')) {
            sidebar.classList.remove('active');
        }
    });

    // Añadir lazy loading a las imágenes
    const images = document.querySelectorAll('img:not([loading])');
    images.forEach(img => {
        img.setAttribute('loading', 'lazy');
    });
});
