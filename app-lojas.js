import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, doc, setDoc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaBody = document.getElementById('tabela-body');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');
const tabs = document.querySelectorAll('#lojas-tabs .nav-link');

let lojaAtual = 'flamengo'; // Padrão
let estado = { corretores: [], feriados: [], escalaSalva: null, diasDoMes: [], semanas: [] };
let carregamentoInicial = true;

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
window.iniciarLojas = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    // Busca Feriados
    const qFeriados = query(collection(db, "feriados"), orderBy("data", "asc"));
    onSnapshot(qFeriados, (snap) => {
        estado.feriados = [];
        snap.forEach(d => estado.feriados.push({ id: d.id, ...d.data() }));
        buscarEscalaNoBanco(); // Se o feriado mudar, atualiza a tela
    });

    // Busca Corretores para o Modal
    const snapCorretores = await getDocs(collection(db, "corretores"));
    estado.corretores = [];
    snapCorretores.forEach(d => {
        estado.corretores.push({ id: d.id, nome: d.data().nome });
    });
    // Ordena por nome
    estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));

    buscarEscalaNoBanco();
};

// ==========================================
// 2. BUSCAR E RENDERIZAR
// ==========================================
async function buscarEscalaNoBanco() {
    const mesRef = filtroMes.value;
    const docId = `${lojaAtual}_${mesRef}`; // Ex: flamengo_2026-02

    try {
        const docSnap = await getDoc(doc(db, "escala_lojas", docId));
        if (docSnap.exists()) {
            estado.escalaSalva = docSnap.data().escala; // Pega o objeto da escala
        } else {
            estado.escalaSalva = {}; // Vazio, precisa sortear
        }
        atualizarVisualizacao();
    } catch (error) {
        console.error("Erro ao buscar escala:", error);
    }
}

function atualizarVisualizacao() {
    const [ano, mes] = filtroMes.value.split('-');
    estado.diasDoMes = getDiasUteisMes(parseInt(ano), parseInt(mes) - 1, estado.feriados);
    estado.semanas = agruparSemanas(estado.diasDoMes);

    if (carregamentoInicial) {
        const hojeISO = new Date().toISOString().split('T')[0];
        const indexSemanaAtual = estado.semanas.findIndex(semana => semana.some(dia => dia.iso === hojeISO));
        if (indexSemanaAtual !== -1) filtroSemana.value = indexSemanaAtual;
        carregamentoInicial = false;
    }

    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemana = estado.semanas[indiceSemana] || [];

    if (diasDaSemana.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Não há dias úteis nesta semana.</td></tr>';
        return;
    }

    let htmlBody = '';
    
    diasDaSemana.forEach(dia => {
        let hojeISO = new Date().toISOString().split('T')[0];
        let classHoje = (dia.iso === hojeISO) ? "bg-warning" : "bg-white";
        let textoHoje = (dia.iso === hojeISO) ? '<br><span class="badge bg-danger mt-1">HOJE</span>' : '';
        let classFeriadoTd = dia.isFeriado ? "bg-danger text-white bg-opacity-75 border-danger" : classHoje;

        htmlBody += `<tr>`;
        htmlBody += `
            <td class="${classFeriadoTd} border-end border-3 border-dark fw-bold text-center" style="vertical-align: middle;">
                <div class="fs-5">${dia.diaSemana}</div>
                <div class="${dia.isFeriado ? 'text-white' : 'text-muted'} small">${dia.fmt}</div>
                ${textoHoje}
            </td>
        `;

        if (dia.isFeriado) {
            htmlBody += `
                <td colspan="4" class="bg-light align-middle text-center" style="height: 80px;">
                    <div class="alert alert-secondary mb-0 d-inline-block shadow-sm border-secondary fw-bold px-4 py-2">
                        🏖️ Folga / Feriado: <span class="text-danger">${dia.descricaoFeriado}</span>
                    </div>
                </td>
            `;
        } else {
            // Pega os corretores do banco. Se não tiver, fica vazio.
            let escaladosHoje = estado.escalaSalva[dia.iso] || { manha: [null, null], tarde: [null, null] };

            // Função helper para desenhar as cadeiras
            const desenharCadeira = (corretor) => {
                if (corretor) {
                    return `<td class="align-middle">
                                <div class="card-vaga">
                                    <div class="nome-corretor text-truncate text-center w-100" title="${corretor.nome}">
                                        ${corretor.nome.split(' ')[0]}
                                    </div>
                                </div>
                            </td>`;
                } else {
                    return `<td class="bg-light text-muted fst-italic align-middle text-center"><small>Livre</small></td>`;
                }
            };

            htmlBody += desenharCadeira(escaladosHoje.manha[0]); // Manhã 1
            htmlBody += desenharCadeira(escaladosHoje.manha[1]); // Manhã 2
            htmlBody += desenharCadeira(escaladosHoje.tarde[0]); // Tarde 1
            htmlBody += desenharCadeira(escaladosHoje.tarde[1]); // Tarde 2
        }
        
        htmlBody += `</tr>`;
    });
    tabelaBody.innerHTML = htmlBody;
}

// ==========================================
// 3. UI E NAVEGAÇÃO
// ==========================================
window.mudarLoja = (loja, event) => {
    event.preventDefault();
    lojaAtual = loja;
    
    // Atualiza visual das abas
    tabs.forEach(t => {
        t.classList.remove('active', 'bg-white', 'border', 'text-dark');
        if (t.innerText.toLowerCase().includes(loja)) {
            t.classList.add('active');
        } else {
            t.classList.add('bg-white', 'border', 'text-dark');
        }
    });

    const nomeCapitalizado = loja.charAt(0).toUpperCase() + loja.slice(1);
    document.getElementById('titulo-tabela').innerText = `📅 Escala - Loja ${nomeCapitalizado}`;
    document.getElementById('nome-loja-btn').innerText = nomeCapitalizado;

    buscarEscalaNoBanco(); // Recarrega os dados da nova loja
};

filtroMes.addEventListener('change', buscarEscalaNoBanco);
filtroSemana.addEventListener('change', atualizarVisualizacao);

// ==========================================
// 4. MODAL E SORTEIO MÁGICO
// ==========================================
window.abrirModalSorteio = () => {
    const divCheckboxes = document.getElementById('lista-checkboxes-corretores');
    let html = '';

    estado.corretores.forEach(c => {
        html += `
            <div class="col-md-4">
                <div class="form-check border rounded p-2 bg-white shadow-sm">
                    <input class="form-check-input ms-1 me-2 chk-corretor" type="checkbox" value="${c.id}" id="chk_${c.id}" data-nome="${c.nome}">
                    <label class="form-check-label fw-bold w-100" style="cursor: pointer;" for="chk_${c.id}">
                        ${c.nome.split(' ')[0]}
                    </label>
                </div>
            </div>
        `;
    });

    divCheckboxes.innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modal-sorteio'));
    modal.show();
};

window.marcarTodos = () => {
    document.querySelectorAll('.chk-corretor').forEach(el => el.checked = true);
};

window.sortearESalvar = async () => {
    const checkboxes = document.querySelectorAll('.chk-corretor:checked');
    if (checkboxes.length === 0) return alert("Selecione pelo menos um corretor!");

    let selecionados = [];
    checkboxes.forEach(c => selecionados.push({ id: c.value, nome: c.getAttribute('data-nome') }));

    // Conta quantos dias úteis (sem feriado) tem no mês
    let diasAtivos = estado.diasDoMes.filter(d => !d.isFeriado);
    let totalCadeiras = diasAtivos.length * 4; // 4 vagas por dia ativo

    // Cria um "Baralho" justo: Multiplica a lista de selecionados até dar a quantidade exata de cadeiras
    let baralho = [];
    let indexSelecionado = 0;
    
    // Embaralha a lista inicial para não favorecer a ordem alfabética
    selecionados.sort(() => Math.random() - 0.5);

    while (baralho.length < totalCadeiras) {
        baralho.push(selecionados[indexSelecionado]);
        indexSelecionado++;
        if (indexSelecionado >= selecionados.length) indexSelecionado = 0;
    }

    // Embaralha o baralho final
    baralho.sort(() => Math.random() - 0.5);

    // Distribui o baralho nos dias
    let novaEscala = {};
    let cartaAtual = 0;

    estado.diasDoMes.forEach(dia => {
        if (dia.isFeriado) return; // Pula

        novaEscala[dia.iso] = {
            manha: [baralho[cartaAtual++], baralho[cartaAtual++]],
            tarde: [baralho[cartaAtual++], baralho[cartaAtual++]]
        };
    });

    // Salvar no Banco
    try {
        const mesRef = filtroMes.value;
        const docId = `${lojaAtual}_${mesRef}`;
        
        await setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAtual,
            mes: mesRef,
            escala: novaEscala,
            atualizadoEm: new Date().toISOString()
        });

        alert("✅ Escala gerada e salva com sucesso!");
        
        // Fecha o modal e recarrega
        bootstrap.Modal.getInstance(document.getElementById('modal-sorteio')).hide();
        buscarEscalaNoBanco();

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar no banco de dados.");
    }
};

// ==========================================
// 5. HELPER: CALENDÁRIO (Copiado do Plantão Normal)
// ==========================================
function getDiasUteisMes(ano, mesIndex, listaDeFeriados = []) {
    let date = new Date(ano, mesIndex, 1);
    let days = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];
    
    while (date.getMonth() === mesIndex) {
        let diaSemana = date.getDay();
        let iso = date.toISOString().split('T')[0]; 
        let feriadoEncontrado = listaDeFeriados.find(f => f.data === iso);

        if (diaSemana !== 0 && diaSemana !== 6) { 
            let fmt = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            days.push({ 
                iso, fmt, diaSemana: nomesDias[diaSemana],
                isFeriado: !!feriadoEncontrado, 
                descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : "" 
            });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function agruparSemanas(diasUteis) {
    let semanas = [];
    let semanaAtual = [];
    diasUteis.forEach(dia => {
        semanaAtual.push(dia);
        if (dia.diaSemana === 'Sexta' || semanaAtual.length === 5) {
            semanas.push(semanaAtual);
            semanaAtual = [];
        }
    });
    if (semanaAtual.length > 0) semanas.push(semanaAtual);
    return semanas;
}

window.iniciarLojas();
