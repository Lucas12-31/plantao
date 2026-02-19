import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, doc, setDoc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaBody = document.getElementById('tabela-body');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');
const tabs = document.querySelectorAll('#lojas-tabs .nav-link');

let lojaAtual = 'flamengo'; 
let estado = { corretores: [], feriados: [], escalaSalva: null, diasDoMes: [], semanas: [] };
let carregamentoInicial = true;

window.editandoPlantao = { iso: null, turno: null, index: null, dataFmt: null };

// ==========================================
// 1. INICIALIZAÇÃO E BUSCA
// ==========================================
window.iniciarLojas = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    const qFeriados = query(collection(db, "feriados"), orderBy("data", "asc"));
    onSnapshot(qFeriados, (snap) => {
        estado.feriados = [];
        snap.forEach(d => estado.feriados.push({ id: d.id, ...d.data() }));
        buscarEscalaNoBanco(); 
    });

    const snapCorretores = await getDocs(collection(db, "corretores"));
    estado.corretores = [];
    snapCorretores.forEach(d => {
        estado.corretores.push({ id: d.id, nome: d.data().nome });
    });
    estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));

    buscarEscalaNoBanco();
};

async function buscarEscalaNoBanco() {
    const mesRef = filtroMes.value;
    const docId = `${lojaAtual}_${mesRef}`; 

    try {
        const docSnap = await getDoc(doc(db, "escala_lojas", docId));
        if (docSnap.exists()) {
            estado.escalaSalva = docSnap.data().escala; 
        } else {
            estado.escalaSalva = {}; 
        }
        atualizarVisualizacao();
    } catch (error) {
        console.error("Erro ao buscar escala:", error);
    }
}

// ==========================================
// 2. RENDERIZAR TABELA
// ==========================================
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
            let escaladosHoje = estado.escalaSalva[dia.iso] || { manha: [null, null], tarde: [null, null] };

            const desenharCadeira = (corretor, iso, turno, index, dataFmt) => {
                let conteudo = '';
                let classesCard = 'card-vaga shadow-sm';
                let classesTexto = 'nome-corretor text-truncate text-center w-100';
                let badgeAtendimentos = '';

                if (corretor) {
                    if (corretor.falta) {
                        classesCard += ' falta-bg';
                        classesTexto += ' falta-text';
                    }
                    if (corretor.atendimentos > 0) {
                        badgeAtendimentos = `<span class="badge bg-success position-absolute top-0 start-100 translate-middle rounded-pill shadow" style="font-size: 0.8rem; z-index: 2;">${corretor.atendimentos}</span>`;
                    }
                    
                    // Se houver indicação de troca, coloca uma pequena borda amarela
                    if (corretor.trocaInfo) {
                        classesCard += ' border-warning border-2';
                    }

                    conteudo = `
                        <div class="${classesCard}" onclick="abrirDetalhesPlantao('${iso}', '${turno}', ${index}, '${dataFmt}')">
                            ${badgeAtendimentos}
                            <div class="${classesTexto}" title="${corretor.nome}">
                                ${corretor.nome.split(' ')[0]}
                            </div>
                        </div>`;
                } else {
                    conteudo = `
                        <div class="card-vaga" style="border-style: dotted;" onclick="abrirDetalhesPlantao('${iso}', '${turno}', ${index}, '${dataFmt}')">
                            <div class="text-muted fst-italic text-center w-100"><small>Vaga Livre</small></div>
                        </div>`;
                }
                return `<td class="align-middle p-2" style="width: 21%;">${conteudo}</td>`;
            };

            htmlBody += desenharCadeira(escaladosHoje.manha[0], dia.iso, 'manha', 0, dia.fmt); 
            htmlBody += desenharCadeira(escaladosHoje.manha[1], dia.iso, 'manha', 1, dia.fmt); 
            htmlBody += desenharCadeira(escaladosHoje.tarde[0], dia.iso, 'tarde', 0, dia.fmt); 
            htmlBody += desenharCadeira(escaladosHoje.tarde[1], dia.iso, 'tarde', 1, dia.fmt); 
        }
        
        htmlBody += `</tr>`;
    });
    tabelaBody.innerHTML = htmlBody;
}

// ==========================================
// 3. GERENCIAMENTO DE PLANTÃO INDIVIDUAL E TROCA
// ==========================================

window.abrirDetalhesPlantao = (iso, turno, index, dataFmt) => {
    window.editandoPlantao = { iso, turno, index, dataFmt };
    
    let corretorAtual = null;
    if(estado.escalaSalva[iso] && estado.escalaSalva[iso][turno]) {
        corretorAtual = estado.escalaSalva[iso][turno][index];
    }

    let nomeExibicao = corretorAtual ? corretorAtual.nome.split(' ')[0] : 'Vaga Livre';
    let turnoExibicao = turno === 'manha' ? 'Manhã' : 'Tarde';
    document.getElementById('modal-detalhes-titulo').innerText = `${nomeExibicao} - ${dataFmt} (${turnoExibicao})`;

    let selectHtml = '<option value="">-- Deixar Vaga Livre --</option>';
    estado.corretores.forEach(c => {
        let isSelected = (corretorAtual && corretorAtual.id === c.id) ? 'selected' : '';
        selectHtml += `<option value="${c.id}" data-nome="${c.nome}" ${isSelected}>${c.nome}</option>`;
    });
    document.getElementById('select-alterar-corretor').innerHTML = selectHtml;

    document.getElementById('input-atendimentos').value = corretorAtual && corretorAtual.atendimentos ? corretorAtual.atendimentos : 0;
    document.getElementById('check-falta').checked = corretorAtual && corretorAtual.falta === true;

    // NOVO: Exibe o texto da troca se existir
    const divTroca = document.getElementById('info-troca-container');
    const textoTroca = document.getElementById('texto-info-troca');
    if (corretorAtual && corretorAtual.trocaInfo) {
        textoTroca.innerHTML = corretorAtual.trocaInfo;
        divTroca.classList.remove('d-none');
    } else {
        textoTroca.innerHTML = '';
        divTroca.classList.add('d-none');
    }

    new bootstrap.Modal(document.getElementById('modal-detalhes-plantao')).show();
}

window.mudarAtendimentos = (valor) => {
    const input = document.getElementById('input-atendimentos');
    let atual = parseInt(input.value) || 0;
    atual += valor;
    if(atual < 0) atual = 0; 
    input.value = atual;
}

window.salvarDetalhesPlantao = async () => {
    const select = document.getElementById('select-alterar-corretor');
    const idSelecionado = select.value;
    const { iso, turno, index } = window.editandoPlantao;
    
    if(!estado.escalaSalva[iso]) estado.escalaSalva[iso] = { manha: [null, null], tarde: [null, null] };

    let corretorOriginal = estado.escalaSalva[iso][turno][index];
    let infoTrocaExistente = null;
    
    // Se não trocou a pessoa manualmente, mantem o registro de troca dela
    if (corretorOriginal && corretorOriginal.id === idSelecionado) {
        infoTrocaExistente = corretorOriginal.trocaInfo;
    }

    if (idSelecionado) {
        const nomeSelecionado = select.options[select.selectedIndex].getAttribute('data-nome');
        const atendimentos = parseInt(document.getElementById('input-atendimentos').value) || 0;
        const falta = document.getElementById('check-falta').checked;

        estado.escalaSalva[iso][turno][index] = {
            id: idSelecionado,
            nome: nomeSelecionado,
            atendimentos: atendimentos,
            falta: falta
        };

        if (infoTrocaExistente) {
            estado.escalaSalva[iso][turno][index].trocaInfo = infoTrocaExistente;
        }
    } else {
        estado.escalaSalva[iso][turno][index] = null;
    }

    try {
        const mesRef = filtroMes.value;
        const docId = `${lojaAtual}_${mesRef}`;
        await setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAtual, mes: mesRef, escala: estado.escalaSalva, atualizadoEm: new Date().toISOString()
        });

        bootstrap.Modal.getInstance(document.getElementById('modal-detalhes-plantao')).hide();
        atualizarVisualizacao(); 

    } catch (error) {
        console.error("Erro ao salvar detalhes:", error);
        alert("Erro ao salvar no banco de dados.");
    }
}

// ==========================================
// 4. NOVA FUNÇÃO: SISTEMA DE TROCA ENTRE 2 DIAS
// ==========================================
window.abrirModalTroca = () => {
    let options = '';
    estado.diasDoMes.forEach(d => {
        if(!d.isFeriado) {
            options += `<option value="${d.iso}">${d.fmt} - ${d.diaSemana}</option>`;
        }
    });
    document.getElementById('troca-data-1').innerHTML = options;
    document.getElementById('troca-data-2').innerHTML = options;
    
    new bootstrap.Modal(document.getElementById('modal-troca')).show();
};

window.efetuarTroca = async () => {
    const d1 = document.getElementById('troca-data-1').value;
    const t1 = document.getElementById('troca-turno-1').value;
    const c1 = parseInt(document.getElementById('troca-cadeira-1').value);

    const d2 = document.getElementById('troca-data-2').value;
    const t2 = document.getElementById('troca-turno-2').value;
    const c2 = parseInt(document.getElementById('troca-cadeira-2').value);

    if (d1 === d2 && t1 === t2 && c1 === c2) {
        return alert("Você selecionou exatamente a mesma cadeira nas duas opções. Altere para trocar.");
    }

    if (!estado.escalaSalva[d1] || !estado.escalaSalva[d2]) {
        return alert("Erro: Um dos dias selecionados ainda não possui escala gerada.");
    }

    // Pega os objetos originais
    let obj1 = estado.escalaSalva[d1][t1][c1];
    let obj2 = estado.escalaSalva[d2][t2][c2];

    let nome1 = obj1 ? obj1.nome.split(' ')[0] : "Vaga Livre";
    let nome2 = obj2 ? obj2.nome.split(' ')[0] : "Vaga Livre";

    const fmtData1 = estado.diasDoMes.find(d => d.iso === d1).fmt;
    const fmtData2 = estado.diasDoMes.find(d => d.iso === d2).fmt;
    const labelT1 = t1 === 'manha' ? 'Manhã' : 'Tarde';
    const labelT2 = t2 === 'manha' ? 'Manhã' : 'Tarde';

    // Cria cópias pra evitar bugs de referência de memória
    let novoObj1 = obj2 ? { ...obj2 } : null;
    let novoObj2 = obj1 ? { ...obj1 } : null;

    // Adiciona as mensagens invertidas
    if (novoObj1) {
        novoObj1.trocaInfo = `🔄 Trocou com <b>${nome1}</b><br><small>(O original dele era ${fmtData1} - ${labelT1})</small>`;
    }
    if (novoObj2) {
        novoObj2.trocaInfo = `🔄 Trocou com <b>${nome2}</b><br><small>(O original dele era ${fmtData2} - ${labelT2})</small>`;
    }

    // Efetua a substituição
    estado.escalaSalva[d1][t1][c1] = novoObj1;
    estado.escalaSalva[d2][t2][c2] = novoObj2;

    try {
        const mesRef = filtroMes.value;
        const docId = `${lojaAtual}_${mesRef}`;
        
        await setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAtual,
            mes: mesRef,
            escala: estado.escalaSalva,
            atualizadoEm: new Date().toISOString()
        });

        alert(`✅ Troca efetuada com sucesso!\n\n${nome1} assumiu a cadeira de ${fmtData2}.\n${nome2} assumiu a cadeira de ${fmtData1}.`);
        bootstrap.Modal.getInstance(document.getElementById('modal-troca')).hide();
        atualizarVisualizacao();

    } catch (error) {
        console.error("Erro ao salvar troca:", error);
        alert("Erro ao salvar no banco de dados.");
    }
};

// ==========================================
// 5. NAVEGAÇÃO ENTRE ABAS
// ==========================================
window.mudarLoja = (loja, event) => {
    event.preventDefault();
    lojaAtual = loja;
    
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

    buscarEscalaNoBanco(); 
};

filtroMes.addEventListener('change', buscarEscalaNoBanco);
filtroSemana.addEventListener('change', atualizarVisualizacao);

// ==========================================
// 6. MODAL E SORTEIO INTELIGENTE
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
    new bootstrap.Modal(document.getElementById('modal-sorteio')).show();
};

window.marcarTodos = () => {
    document.querySelectorAll('.chk-corretor').forEach(el => el.checked = true);
};

window.sortearESalvar = async () => {
    const checkboxes = document.querySelectorAll('.chk-corretor:checked');
    if (checkboxes.length === 0) return alert("Selecione pelo menos um corretor!");

    if (checkboxes.length < 4) {
        if (!confirm("⚠️ Atenção: Marcou menos de 4 corretores. Algumas cadeiras ficarão vazias. Continuar?")) return;
    }

    let selecionados = [];
    checkboxes.forEach(c => selecionados.push({ id: c.value, nome: c.getAttribute('data-nome') }));

    const mesRef = filtroMes.value;
    const outraLoja = lojaAtual === 'flamengo' ? 'tijuca' : 'flamengo';
    let escalaOutraLoja = {};

    try {
        const docOutraLoja = await getDoc(doc(db, "escala_lojas", `${outraLoja}_${mesRef}`));
        if (docOutraLoja.exists()) escalaOutraLoja = docOutraLoja.data().escala || {};
    } catch(e) { console.error("Erro ao buscar dados da outra loja", e); }

    let contagemTurnos = {};
    selecionados.forEach(c => contagemTurnos[c.id] = 0);

    let novaEscala = {};

    estado.diasDoMes.forEach(dia => {
        if (dia.isFeriado) return; 

        let iso = dia.iso;
        let ocupadosOutraLoja = []; 

        if (escalaOutraLoja[iso]) {
            const eOutra = escalaOutraLoja[iso];
            if (eOutra.manha[0]) ocupadosOutraLoja.push(eOutra.manha[0].id);
            if (eOutra.manha[1]) ocupadosOutraLoja.push(eOutra.manha[1].id);
            if (eOutra.tarde[0]) ocupadosOutraLoja.push(eOutra.tarde[0].id);
            if (eOutra.tarde[1]) ocupadosOutraLoja.push(eOutra.tarde[1].id);
        }

        let escolhidosHoje = []; 

        for (let i = 0; i < 4; i++) {
            let candidatosDisponiveis = selecionados.filter(c => 
                !ocupadosOutraLoja.includes(c.id) && 
                !escolhidosHoje.some(escolhido => escolhido !== null && escolhido.id === c.id) 
            );

            if (candidatosDisponiveis.length === 0) {
                escolhidosHoje.push(null); 
            } else {
                candidatosDisponiveis.sort((a, b) => {
                    let pesoA = contagemTurnos[a.id];
                    let pesoB = contagemTurnos[b.id];
                    if (pesoA === pesoB) return Math.random() - 0.5; 
                    return pesoA - pesoB;
                });

                let selecionado = candidatosDisponiveis[0];
                escolhidosHoje.push({ id: selecionado.id, nome: selecionado.nome, atendimentos: 0, falta: false }); 
                contagemTurnos[selecionado.id]++; 
            }
        }

        let validos = escolhidosHoje.filter(x => x !== null);
        let nulos = escolhidosHoje.filter(x => x === null);
        validos.sort(() => Math.random() - 0.5);
        let resultadoFinalDia = [...validos, ...nulos];
        
        while(resultadoFinalDia.length < 4) resultadoFinalDia.push(null);

        novaEscala[iso] = {
            manha: [resultadoFinalDia[0], resultadoFinalDia[1]],
            tarde: [resultadoFinalDia[2], resultadoFinalDia[3]]
        };
    });

    try {
        const docId = `${lojaAtual}_${mesRef}`;
        await setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAtual, mes: mesRef, escala: novaEscala, atualizadoEm: new Date().toISOString()
        });
        alert("✅ Escala gerada com sucesso!");
        bootstrap.Modal.getInstance(document.getElementById('modal-sorteio')).hide();
        buscarEscalaNoBanco();

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar no banco de dados.");
    }
};

// ==========================================
// 7. HELPER: CALENDÁRIO
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
                iso, fmt, diaSemana: nomesDias[diaSemana], isFeriado: !!feriadoEncontrado, descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : "" 
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
