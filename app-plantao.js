import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaBody = document.getElementById('tabela-body');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');

const formFeriado = document.getElementById('form-feriado');
const listaFeriadosEl = document.getElementById('lista-feriados');

let estado = { 
    corretores: [], 
    leads: [], 
    feriados: [], 
    escalaFixa: {}, 
    diasDoMes: [], 
    semanas: [] 
};
let carregamentoInicial = true;

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
window.iniciarPlantao = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    tabelaBody.innerHTML = '<tr><td colspan="4" class="text-center py-5">Buscando dados no servidor...</td></tr>';

    const qFeriados = query(collection(db, "feriados"), orderBy("data", "asc"));
    onSnapshot(qFeriados, (snap) => {
        estado.feriados = [];
        let htmlFeriados = '';
        
        snap.forEach(d => {
            const f = d.data();
            estado.feriados.push({ id: d.id, ...f });
            
            const dataFmt = f.data.split('-').reverse().join('/');
            htmlFeriados += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong class="text-danger">${dataFmt}</strong><br>
                        <small class="text-muted">${f.descricao}</small>
                    </div>
                    <button onclick="deletarFeriado('${d.id}')" class="btn btn-sm btn-outline-danger" title="Remover Folga">🗑️</button>
                </li>
            `;
        });
        
        if(estado.feriados.length === 0) htmlFeriados = '<li class="list-group-item text-muted text-center">Nenhum feriado cadastrado.</li>';
        if(listaFeriadosEl) listaFeriadosEl.innerHTML = htmlFeriados;

        estado.escalaFixa = {};
