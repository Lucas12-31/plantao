import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, doc, setDoc, getDoc, query, orderBy, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaBody = document.getElementById('tabela-body');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');
const tabs = document.querySelectorAll('#lojas-tabs .nav-link');

let lojaAtual = 'flamengo'; 
let estado = { corretores: [], feriados: [], escalaSalva: {}, semanas: [] };
let carregamentoInicial = true;

window.editandoPlantao = { iso: null, turno: null, index: null, dataFmt: null };

// ==========================================
// 1. INICIALIZAÇÃO E BUSCA INTELIGENTE (3 MESES)
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

    onSnapshot(collection(db, "corretores"), (snap) => {
        estado.corretores = [];
        snap.forEach(d => {
            let dados = d.data();
            estado.corretores.push({ 
                id: d.id, 
                nome: dados.nome,
                pme: parseFloat(dados.producao_pme) || 0,
                pf: parseFloat(dados.producao_pf) || 0,
                faltas: parseInt(dados.faltas) || 0 
            });
        });
        estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    });

    buscarEscalaNoBanco();
};

async function buscarEscalaNoBanco() {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    const ano = parseInt(anoStr);
    const mesIndex = parseInt(mesStr) - 1;

    // Para montar semanas perfeitas, precisamos puxar o mês anterior, o atual e o próximo!
    const prev = new Date(ano, mesIndex - 1, 1);
    const next = new Date(ano, mesIndex + 1, 1);
    const formataMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    const docAtual = `${lojaAtual}_${filtroMes.value}`;
    const docPrev = `${lojaAtual}_${formataMes(prev)}`;
    const docNext = `${lojaAtual}_${formataMes(next)}`;

    try {
        const [snapAtual, snapPrev, snapNext] = await Promise.all([
            getDoc(doc(db, "escala_lojas", docAtual)),
            getDoc(doc(db, "escala_lojas", docPrev)),
            getDoc(doc(db, "escala_lojas", docNext))
        ]);

        estado.escalaSalva = {};
        if (snapPrev.exists() && snapPrev.data().escala) Object.assign(estado.escalaSalva, snapPrev.data().escala);
        if (snapNext.exists() && snapNext.data().escala) Object.assign(estado.escalaSalva, snapNext.data().escala);
        if (snapAtual.exists() && snapAtual.data().escala) Object.assign(estado.escalaSalva, snapAtual.data().escala);

        atualizarVisualizacao();
    } catch (error) {
        console.error("Erro ao buscar escala:", error);
    }
}

// NOVO: Função para fatiar as edições e salvar cada dia na sua "pasta" (Mês) correta no banco!
async function salvarEscalaNoBancoBaseadoNasDatas() {
    let lotesPorMes = {};
    
    for (let iso in estado.escalaSalva) {
        let mesDoIso = iso.substring(0, 7); // Ex: "2026-06"
        if(!lotesPorMes[mesDoIso]) lotesPorMes[mesDoIso] = {};
        lotesPorMes[mesDoIso][iso] = estado.escalaSalva[iso];
    }

    const promessas = Object.keys(lotesPorMes).map(mesKey => {
        const docId = `${lojaAtual}_${mesKey}`;
        return setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAtual,
            mes: mesKey,
            escala: lotesPorMes[mesKey],
            atualizadoEm: new Date().toISOString()
        }, { merge: true }); // Merge salva só o que mudou sem apagar o resto
    });

    await Promise.all(promessas);
}

// ==========================================
// 2. RENDERIZAR TABELA E ATUALIZAR DROPDOWN
// ==========================================
function atualizarVisualizacao() {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    estado.semanas = getSemanasFluidas(parseInt(anoStr), parseInt(mesStr) - 1, estado.feriados);

    // NOVO: Preenche a caixinha de Semanas dinamicamente com as datas reais!
    const valorAntigoSemana = filtroSemana.value;
    filtroSemana.innerHTML = '';
    estado.semanas.forEach((sem, index) => {
        let dataInicio = sem[0].fmt;
        let dataFim = sem[sem.length - 1].fmt;
        filtroSemana.innerHTML += `<option value="${index}">Semana ${index + 1} (${dataInicio} a ${dataFim})</option>`;
    });

    if (carregamentoInicial) {
        const hojeISO = new Date().toISOString().split('T')[0];
        const indexSemanaAtual = estado.semanas.findIndex(semana => semana.some(dia => dia.iso === hojeISO));
        filtroSemana.value = indexSemanaAtual !== -1 ? indexSemanaAtual : 0;
        carregamentoInicial = false;
    } else if (valorAntigoSemana && valorAntigoSemana < estado.semanas.length) {
        filtroSemana.value = valorAntigoSemana;
    }

    const indiceSemana = parseInt(filtroSemana.value) || 0;
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

        // Se o dia pertence a um mês diferente do selecionado, deixamos ele cinza para dar um charme visual
        let classeMesDiferente = (dia.iso.substring(0,7) !== filtroMes.value) ? "fst-italic opacity-75" : "";

        htmlBody += `<tr class="${classeMesDiferente}">`;
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
                let classesCard = 'card-vaga shadow-sm border-2'; 
                let classesTexto = 'nome-corretor text-truncate text-center w-100';
                let badgeAtendimentos = '';
                let iconeTroca = '';

                if (corretor) {
                    if (corretor.falta) {
                        classesCard += ' falta-bg';
                        classesTexto += ' falta-text';
                    }
                    if (corretor.atendimentos > 0) {
                        badgeAtendimentos = `<span class="badge bg-success position-absolute top-0 start-100 translate-middle rounded-pill shadow" style="font-size: 0.8rem; z-index: 2;">${corretor.atendimentos}</span>`;
                    }
                    if (corretor.trocaInfo) {
                        classesCard += ' border-warning border-2';
                        iconeTroca = '<span title="Plantão Trocado" class="me-1">🔄</span>';
                    }

                    let partesNome = corretor.nome.split(' ');
                    let nomeExibicao = partesNome[0] + (partesNome.length > 1 ? ' ' + partesNome[1] : '');

                    conteudo = `
                        <div class="${classesCard}" onclick="abrirDetalhesPlantao('${iso}', '${turno}', ${index}, '${dataFmt}')">
                            ${badgeAtendimentos}
                            <div class="${classesTexto}" title="${corretor.nome}">
                                ${iconeTroca}${nomeExibicao}
                            </div>
                        </div>`;
                } else {
                    conteudo = `
                        <div class="card-vaga border-2" style="border-style: dotted;" onclick="abrirDetalhesPlantao('${iso}', '${turno}', ${index}, '${dataFmt}')">
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
// 3. GERENCIAMENTO E SALVAMENTO DE FALTAS
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
    let infoTrocaExistente = corretorOriginal ? corretorOriginal.trocaInfo : null;
    let idAntigo = corretorOriginal ? corretorOriginal.id : null;
    let faltaAntiga = corretorOriginal ? (corretorOriginal.falta === true) : false;
    
    const faltaNova = document.getElementById('check-falta').checked;

    try {
        if (idSelecionado) {
            if (idSelecionado === idAntigo) {
                if (faltaNova !== faltaAntiga) {
                    let diff = faltaNova ? 1 : -1;
                    await updateDoc(doc(db, "corretores", idSelecionado), { faltas: increment(diff) });
                }
            } else {
                if (idAntigo && faltaAntiga) {
                    await updateDoc(doc(db, "corretores", idAntigo), { faltas: increment(-1) });
                }
                if (faltaNova) {
                    await updateDoc(doc(db, "corretores", idSelecionado), { faltas: increment(1) });
                }
            }
        } else {
            if (idAntigo && faltaAntiga) {
                await updateDoc(doc(db, "corretores", idAntigo), { faltas: increment(-1) });
            }
        }

        if (idSelecionado) {
            const nomeSelecionado = select.options[select.selectedIndex].getAttribute('data-nome');
            const atendimentos = parseInt(document.getElementById('input-atendimentos').value) || 0;
            estado.escalaSalva[iso][turno][index] = { id: idSelecionado, nome: nomeSelecionado, atendimentos: atendimentos, falta: faltaNova };
            if (infoTrocaExistente && idSelecionado === idAntigo) {
                estado.escalaSalva[iso][turno][index].trocaInfo = infoTrocaExistente;
            }
        } else {
            estado.escalaSalva[iso][turno][index] = null;
        }

        await salvarEscalaNoBancoBaseadoNasDatas();

        bootstrap.Modal.getInstance(document.getElementById('modal-detalhes-plantao')).hide();
        atualizarVisualizacao(); 

    } catch (error) {
        console.error("Erro ao salvar detalhes:", error);
        alert("Erro ao salvar alterações.");
    }
}

// ==========================================
// 4. TROCA ENTRE PLANTÕES
// ==========================================
window.abrirModalTroca = () => {
    const indiceSemana = parseInt(document.getElementById('filtro-semana').value);
    const diasDaSemanaVisivel = estado.semanas[indiceSemana] || [];

    let options = '';
    let diasValidos = 0;

    diasDaSemanaVisivel.forEach(d => {
        if(!d.isFeriado) {
            options += `<option value="${d.iso}">${d.fmt} - ${d.diaSemana}</option>`;
            diasValidos++;
        }
    });

    if (diasValidos === 0) return alert("Não há dias úteis nesta semana para efetuar trocas.");

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

    if (d1 === d2 && t1 === t2 && c1 === c2) return alert("Selecione cadeiras diferentes.");
    if (!estado.escalaSalva[d1] || !estado.escalaSalva[d2]) return alert("Erro: Dias sem escala gerada.");

    let obj1 = estado.escalaSalva[d1][t1][c1];
    let obj2 = estado.escalaSalva[d2][t2][c2];

    let nome1 = obj1 ? obj1.nome.split(' ')[0] : "Vaga Livre";
    let nome2 = obj2 ? obj2.nome.split(' ')[0] : "Vaga Livre";

    const data1Fmt = d1.split('-').reverse().slice(0,2).join('/');
    const data2Fmt = d2.split('-').reverse().slice(0,2).join('/');
    const labelT1 = t1 === 'manha' ? 'Manhã' : 'Tarde';
    const labelT2 = t2 === 'manha' ? 'Manhã' : 'Tarde';

    let novoObj1 = obj2 ? { ...obj2 } : null;
    let novoObj2 = obj1 ? { ...obj1 } : null;

    if (novoObj1) novoObj1.trocaInfo = `🔄 Trocou com <b>${nome1}</b><br><small>(O original dele era ${data1Fmt} - ${labelT1})</small>`;
    if (novoObj2) novoObj2.trocaInfo = `🔄 Trocou com <b>${nome2}</b><br><small>(O original dele era ${data2Fmt} - ${labelT2})</small>`;

    estado.escalaSalva[d1][t1][c1] = novoObj1;
    estado.escalaSalva[d2][t2][c2] = novoObj2;

    try {
        await salvarEscalaNoBancoBaseadoNasDatas();
        alert(`✅ Troca efetuada com sucesso!\n\n${nome1} assumiu a cadeira de ${data2Fmt}.\n${nome2} assumiu a cadeira de ${data1Fmt}.`);
        bootstrap.Modal.getInstance(document.getElementById('modal-troca')).hide();
        atualizarVisualizacao();
    } catch (error) { console.error("Erro:", error); }
};

window.mudarLoja = (loja, event) => {
    event.preventDefault();
    lojaAtual = loja;
    tabs.forEach(t => {
        t.classList.remove('active', 'bg-white', 'border', 'text-dark');
        if (t.innerText.toLowerCase().includes(loja)) t.classList.add('active');
        else t.classList.add('bg-white', 'border', 'text-dark');
    });
    const nomeCapitalizado = loja.charAt(0).toUpperCase() + loja.slice(1);
    document.getElementById('titulo-tabela').innerText = `📅 Escala - Loja ${nomeCapitalizado}`;
    document.getElementById('nome-loja-btn').innerText = nomeCapitalizado;
    buscarEscalaNoBanco(); 
};

filtroMes.addEventListener('change', buscarEscalaNoBanco);
filtroSemana.addEventListener('change', atualizarVisualizacao);

// ==========================================
// 6. MODAL E SORTEIO INTELIGENTE (POR SEMANA)
// ==========================================
window.abrirModalSorteio = () => {
    const divCheckboxes = document.getElementById('lista-checkboxes-corretores');
    let html = '';

    estado.corretores.forEach(c => {
        let pme = c.pme || 0;
        let pf = c.pf || 0;
        let corBorda = 'border-danger'; 

        if (pme > 0) corBorda = 'border-success'; 
        else if (pf > 0) corBorda = 'border-warning'; 

        let badgeFaltas = c.faltas > 0 ? `<span class="badge bg-danger ms-2" title="Acúmulo de Faltas">${c.faltas} ⚠️</span>` : '';

        html += `
            <div class="col-md-4">
                <div class="form-check border ${corBorda} border-2 rounded p-2 bg-white shadow-sm d-flex align-items-center">
                    <input class="form-check-input ms-1 me-2 chk-corretor" type="checkbox" value="${c.id}" id="chk_${c.id}" data-nome="${c.nome}">
                    <label class="form-check-label fw-bold w-100" style="cursor: pointer;" for="chk_${c.id}">
                        ${c.nome.split(' ')[0]} ${badgeFaltas}
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

// NOVO: Função auxiliar para puxar os dados da Outra Loja dos 3 meses
async function getEscalaOutraLojaMesclada(outraLoja) {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    const ano = parseInt(anoStr);
    const mesIndex = parseInt(mesStr) - 1;

    const prev = new Date(ano, mesIndex - 1, 1);
    const next = new Date(ano, mesIndex + 1, 1);
    const formataMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const [snapAtual, snapPrev, snapNext] = await Promise.all([
        getDoc(doc(db, "escala_lojas", `${outraLoja}_${filtroMes.value}`)),
        getDoc(doc(db, "escala_lojas", `${outraLoja}_${formataMes(prev)}`)),
        getDoc(doc(db, "escala_lojas", `${outraLoja}_${formataMes(next)}`) )
    ]);

    let combinada = {};
    if (snapPrev.exists() && snapPrev.data().escala) Object.assign(combinada, snapPrev.data().escala);
    if (snapNext.exists() && snapNext.data().escala) Object.assign(combinada, snapNext.data().escala);
    if (snapAtual.exists() && snapAtual.data().escala) Object.assign(combinada, snapAtual.data().escala);
    return combinada;
}

window.sortearESalvar = async () => {
    const checkboxes = document.querySelectorAll('.chk-corretor:checked');
    if (checkboxes.length === 0) return alert("Selecione pelo menos um corretor!");

    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemanaVisivel = estado.semanas[indiceSemana] || [];

    if(!confirm(`Deseja gerar e salvar o sorteio para a SEMANA ${indiceSemana + 1}? Isso substituirá as vagas apenas destes dias.`)) return;

    let selecionados = [];
    checkboxes.forEach(c => selecionados.push({ id: c.value, nome: c.getAttribute('data-nome') }));

    const outraLoja = lojaAtual === 'flamengo' ? 'tijuca' : 'flamengo';
    let escalaOutraLoja = await getEscalaOutraLojaMesclada(outraLoja);

    let contagemTurnos = {};
    selecionados.forEach(c => contagemTurnos[c.id] = 0);

    diasDaSemanaVisivel.forEach(dia => {
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

        estado.escalaSalva[iso] = {
            manha: [resultadoFinalDia[0], resultadoFinalDia[1]],
            tarde: [resultadoFinalDia[2], resultadoFinalDia[3]]
        };
    });

    try {
        await salvarEscalaNoBancoBaseadoNasDatas();
        alert("✅ Escala gerada com sucesso!");
        bootstrap.Modal.getInstance(document.getElementById('modal-sorteio')).hide();
        atualizarVisualizacao(); 
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar no banco de dados.");
    }
};

window.zerarEscalaSemana = async () => {
    try {
        const indiceSemana = parseInt(filtroSemana.value);
        const diasDaSemanaVisivel = estado.semanas[indiceSemana] || [];

        if (diasDaSemanaVisivel.length === 0) return alert("Não há dias úteis nesta semana.");

        if (!confirm(`⚠️ Tem certeza que deseja ZERAR toda a escala da Semana ${indiceSemana + 1}?\n\nIsso deixará todos os plantões destes dias como "Vaga Livre".`)) return;

        if (!estado.escalaSalva) estado.escalaSalva = {};

        for (let dia of diasDaSemanaVisivel) {
            let iso = dia.iso;
            if (estado.escalaSalva[iso]) {
                let turnos = ['manha', 'tarde'];
                for (let t of turnos) {
                    for (let i = 0; i < 2; i++) {
                        let c = estado.escalaSalva[iso][t] ? estado.escalaSalva[iso][t][i] : null;
                        if (c && c.falta && c.id) {
                            await updateDoc(doc(db, "corretores", c.id), { faltas: increment(-1) });
                        }
                    }
                }
            }
            estado.escalaSalva[iso] = { manha: [null, null], tarde: [null, null] };
        }

        await salvarEscalaNoBancoBaseadoNasDatas();
        alert("✅ Escala da semana zerada com sucesso!");
        atualizarVisualizacao();

    } catch (error) {
        console.error("Erro ao zerar escala:", error);
        alert("Ops! Erro ao zerar: " + error.message);
    }
};

// ==========================================
// 7. HELPER: CALENDÁRIO FLUIDO (O CÉREBRO NOVO)
// ==========================================
function getSemanasFluidas(ano, mesIndex, listaDeFeriados = []) {
    let primeiroDia = new Date(ano, mesIndex, 1);
    let ultimoDia = new Date(ano, mesIndex + 1, 0);

    // Ajusta o Início (Volta até achar a Segunda-feira)
    let start = new Date(primeiroDia);
    let diaStart = start.getDay();
    if (diaStart === 0) start.setDate(start.getDate() + 1); // Dom -> Seg
    else if (diaStart > 1) start.setDate(start.getDate() - (diaStart - 1)); // Ex: Qui -> Seg

    // Ajusta o Fim (Avança até achar a Sexta-feira)
    let end = new Date(ultimoDia);
    let diaEnd = end.getDay();
    if (diaEnd === 6) end.setDate(end.getDate() - 1); // Sab -> Sex
    else if (diaEnd === 0) end.setDate(end.getDate() - 2); // Dom -> Sex
    else if (diaEnd < 5) end.setDate(end.getDate() + (5 - diaEnd)); // Ter -> Sex

    let semanas = [];
    let semanaAtual = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];

    let current = new Date(start);
    while (current <= end) {
        let diaSemana = current.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { // Pula sábado e domingo
            // YYYY-MM-DD local
            let isoStr = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
            let feriadoEncontrado = listaDeFeriados.find(f => f.data === isoStr);
            let fmt = current.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            
            semanaAtual.push({
                iso: isoStr,
                fmt: fmt,
                diaSemana: nomesDias[diaSemana],
                isFeriado: !!feriadoEncontrado,
                descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : ""
            });

            if (diaSemana === 5) { // Sexta-feira fecha e guarda o pacote da semana inteira
                semanas.push(semanaAtual);
                semanaAtual = [];
            }
        }
        current.setDate(current.getDate() + 1);
    }
    return semanas;
}

window.iniciarLojas();
