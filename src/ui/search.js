  const searchableSelectOptions = new WeakMap();
  const groupPlatforms = Object.freeze({ openai: "OpenAI", deepseek: "DeepSeek", zhipu: "Zhipu GLM", kimi: "Kimi", grok: "Grok", unknown: "未知平台" });

  function normalizeGroupPlatform(value) {
    const key = normalizeSelectorQuery(value).replace(/[\s_-]+/g, "");
    if (["zhipu", "zhipuglm", "glm"].includes(key)) return "zhipu";
    return Object.hasOwn(groupPlatforms, key) ? key : "unknown";
  }

  function groupPlatformFor(group, monitors = [], candidates = []) {
    const id = Number(group?.id ?? group?.groupId);
    const name = String(group?.name ?? group?.group ?? "");
    const matches = (item) => id > 0
      ? Number(item.group_id ?? item.groupId ?? item.id) === id
      : name && String(item.code ?? item.name ?? item.group ?? "") === name;
    return normalizeGroupPlatform(group?.platform
      || monitors.find(matches)?.platform || candidates.find(matches)?.platform);
  }

  function refreshPlatformFilter(select) {
    if (!select) return;
    if (select.options.length === Object.keys(groupPlatforms).length + 1) return;
    const selected = select.value;
    select.replaceChildren(new Option("全部平台", ""),
      ...Object.entries(groupPlatforms).map(([value, label]) => new Option(label, value)));
    select.value = Object.hasOwn(groupPlatforms, selected) ? selected : "";
  }

  function matchesPlatform(option, platform) {
    return !platform?.value || normalizeGroupPlatform(option.dataset?.platform) === platform.value;
  }

  function normalizeSelectorQuery(value) {
    return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
  }

  function filterSelectorList(list, input, status, platform) {
    if (!list || !input) return;
    const query = normalizeSelectorQuery(input.value);
    const options = [...list.children].filter((option) => !option.classList?.contains("empty"));
    let visible = 0;
    options.forEach((option) => {
      option.hidden = !matchesPlatform(option, platform)
        || Boolean(query) && !normalizeSelectorQuery(option.dataset?.searchText || option.textContent).includes(query);
      if (!option.hidden) visible++;
    });
    if (status) status.textContent = !query && !platform?.value ? `共 ${options.length} 项`
      : visible ? `找到 ${visible} / ${options.length} 项` : `无匹配项（共 ${options.length} 项）`;
  }

  function refreshSearchableSelect(select, input, status, platform) {
    if (!select || !input) return;
    searchableSelectOptions.set(select, [...select.options].map((option) => option.cloneNode(true)));
    filterSearchableSelect(select, input, status, platform);
  }

  function filterSearchableSelect(select, input, status, platform) {
    if (!select || !input) return;
    const options = searchableSelectOptions.get(select);
    if (!options) return;
    const query = normalizeSelectorQuery(input.value);
    const selected = select.value;
    let matches = 0;
    const filtered = options.filter((option) => {
      const match = matchesPlatform(option, platform) && (!query || normalizeSelectorQuery(option.textContent).includes(query));
      if (option.value !== "0" && match) matches++;
      // Keep the neutral and current options so filtering can never change a configured value.
      return match || option.value === "0" || option.value === selected;
    });
    select.replaceChildren(...filtered.map((option) => option.cloneNode(true)));
    select.value = selected;
    if (status) status.textContent = !query && !platform?.value ? `共 ${options.filter((option) => option.value !== "0").length} 项`
      : matches ? `找到 ${matches} 项；保留当前选择` : "无匹配项；保留当前选择";
  }

  function bindSelectorSearch(input, filter, target) {
    if (!input) return;
    input.addEventListener("input", filter);
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) {
        input.value = "";
        filter();
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "ArrowDown" && target) {
        const next = target.querySelector
          ? [...target.querySelectorAll("input")].find((choice) => !choice.closest("label")?.hidden && !choice.disabled)
          : null;
        (next || target).focus();
        event.preventDefault();
      }
    });
  }

  function bindPlatformFilter(select, filter) {
    select?.addEventListener("change", (event) => {
      event.stopPropagation();
      filter();
    });
  }
