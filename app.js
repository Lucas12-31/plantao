// app.js
import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-corretor');
const tabela = document.getElementById('tabela-corretores');

// 1. FUNÇÃO PARA SALVAR (Create)
form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Impede a página de recarregar

    const corretor = {
        nome: document.getElementById('nome').value,
        codigo: document.getElementById('codigo').value,
        cpf: document.getElementById('cpf').value,
        email: document.getElementById('email').value,
        telefone: document.getElementById('telefone').value,
        data_cadastro: new Date()
    };

    try {
        await addDoc(collection(db, "corretores"), corretor);
        alert("Corretor salvo com sucesso!");
        form.reset(); // Limpa o formulário
    } catch (error) {
        console.error("Erro ao salvar: ", error);
        alert("Erro ao salvar.");
    }
});

// 2. FUNÇÃO PARA LER E ATUALIZAR LISTA (Read em Tempo Real)
// onSnapshot fica "ouvindo" o banco. Se alguém cadastrar, a lista atualiza sozinha.
onSnapshot(collection(db, "corretores"), (snapshot) => {
    let html = '';
    
    snapshot.forEach(doc => {
        const dados = doc.data();
        const id = doc.id;

        html += `
            <tr>
                <td>${dados.codigo}</td>
                <td>${dados.nome}</td>
                <td>${dados.email}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deletar('${id}')">Excluir</button>
                </td>
            </tr>
        `;
    });

    tabela.innerHTML = html;
});

// 3. FUNÇÃO PARA EXCLUIR (Delete) - precisa estar no escopo global
window.deletar = async (id) => {
    if(confirm("Tem certeza que deseja excluir este corretor?")) {
        await deleteDoc(doc(db, "corretores", id));
    }
}
