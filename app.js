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
let currentlyPlayingAudio = null;

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
const postTemplate = document.getElementById('postTemplate');

// Intersection Observer para detectar posts visibles
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.7  // El elemento debe estar 70% visible
};

let currentObserver = null;

function setupIntersectionObserver() {
    if (currentObserver) {
        currentObserver.disconnect();
    }

    currentObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const postElement = entry.target;
            const audio = postElement.querySelector('.post-audio');
            
            if (entry.isIntersecting) {
                // Si hay otro audio reproduciéndose, detenerlo
                if (currentlyPlayingAudio && currentlyPlayingAudio !== audio) {
                    currentlyPlayingAudio.pause();
                    currentlyPlayingAudio.currentTime = 0;
                }
                
                // Reproducir el nuevo audio
                if (audio && audio.paused) {
                    audio.play();
                    currentlyPlayingAudio = audio;
                }
            } else {
                // Si el elemento sale del viewport, pausar su audio
                if (audio && !audio.paused) {
                    audio.pause();
                    audio.currentTime = 0;
                    if (currentlyPlayingAudio === audio) {
                        currentlyPlayingAudio = null;
                    }
                }
            }
        });
    }, observerOptions);

    // Observar todos los posts existentes
    document.querySelectorAll('.post').forEach(post => {
        currentObserver.observe(post);
    });
}

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
    
    const likeButton = document.querySelector(`[data-post-id="${postId}"] .like-button`);
    const likeCountSpan = likeButton.querySelector('.action-count');
    const isLiked = likeButton.classList.contains('liked');
    
    if (isLiked) {
        likeButton.classList.remove('liked');
        likeCountSpan.textContent = parseInt(likeCountSpan.textContent) - 1;
    } else {
        likeButton.classList.add('liked');
        likeCountSpan.textContent = parseInt(likeCountSpan.textContent) + 1;
    }
    
    const likeRef = database.ref(`likes/${postId}/${currentUser.uid}`);
    const postLikesCountRef = database.ref(`posts/${postId}/likesCount`);
    
    likeRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                return Promise.all([
                    likeRef.remove(),
                    postLikesCountRef.transaction(count => (count || 1) - 1)
                ]);
            } else {
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
            return database.ref(`posts/${postId}/commentsCount`)
                .transaction(count => (count || 0) + 1);
        })
        .catch(error => showError('Error al publicar comentario: ' + error.message));
}

// Crear elemento de post
function createPostElement(post, postId) {
    const postElement = postTemplate.content.cloneNode(true);
    const postContainer = postElement.querySelector('.post');
    
    postContainer.setAttribute('data-post-id', postId);
    
    // Establecer contenido del post
    postContainer.querySelector('.user-avatar').src = post.userPhoto;
    postContainer.querySelector('.user-avatar').alt = post.userName;
    postContainer.querySelector('.post-author').textContent = post.userName;
    postContainer.querySelector('.post-date').textContent = new Date(post.timestamp).toLocaleString();
    postContainer.querySelector('.post-title').textContent = post.title;
    postContainer.querySelector('.post-image').src = post.photoUrl;
    postContainer.querySelector('.post-image').alt = post.title;
    
    // Configurar audio
    const audioElement = postContainer.querySelector('.post-audio');
    audioElement.src = post.audioUrl;
    audioElement.style.display = 'none';
    
    // Configurar contadores
    postContainer.querySelector('.like-button .action-count').textContent = post.likesCount || 0;
    postContainer.querySelector('.comment-button .action-count').textContent = post.commentsCount || 0;
    
    // Event listeners
    postContainer.querySelector('.like-button').addEventListener('click', () => handleLike(postId));
    postContainer.querySelector('.comment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = e.target.querySelector('.comment-input');
        handleComment(postId, input.value);
        input.value = '';
    });
    
    return postContainer;
}

// Cargar posts
function loadPosts() {
    const postsRef = database.ref('posts');
    postsRef.on('value', async (snapshot) => {
        const postsContainer = document.getElementById('posts');
        const currentPosts = Array.from(postsContainer.children);
        const currentScrollPosition = window.scrollY;
        
        const posts = [];
        snapshot.forEach((childSnapshot) => {
            posts.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });

        posts.sort((a, b) => b.timestamp - a.timestamp);

        // Crear un mapa de los posts existentes
        const existingPosts = new Map();
        currentPosts.forEach(post => {
            const postId = post.getAttribute('data-post-id');
            existingPosts.set(postId, post);
        });

        // Limpiar el contenedor
        postsContainer.innerHTML = '';

        for (const post of posts) {
            let postElement;
            
            if (existingPosts.has(post.id)) {
                postElement = existingPosts.get(post.id);
                const likeCount = postElement.querySelector('.like-button .action-count');
                if (likeCount) {
                    likeCount.textContent = post.likesCount || 0;
                }
            } else {
                postElement = createPostElement(post, post.id);
            }

            if (currentUser) {
                const likeSnapshot = await database.ref(`likes/${post.id}/${currentUser.uid}`).once('value');
                if (likeSnapshot.exists()) {
                    postElement.querySelector('.like-button').classList.add('liked');
                } else {
                    postElement.querySelector('.like-button').classList.remove('liked');
                }
            }
            
            postsContainer.appendChild(postElement);
            loadComments(post.id);
        }

        // Restaurar la posición del scroll
        window.scrollTo(0, currentScrollPosition);
        
        // Configurar el observer después de cargar los posts
        setupIntersectionObserver();
    });
}

// Cargar comentarios
function loadComments(postId) {
    const commentsRef = database.ref(`comments/${postId}`);
    commentsRef.on('value', (snapshot) => {
        const commentsContainer = document.querySelector(`[data-post-id="${postId}"] .comments-container`);
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
                <img src="${comment.userPhoto}" alt="${comment.userName}" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${comment.userName}</span>
                        <span class="comment-date">${new Date(comment.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="comment-text">${comment.text}</div>
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
