const mapInteractions = (() => {
  const ENTRIES = [
    {
      id: "farmhouse-door",
      x: 350,
      y: 418,
      radius: 84,
      priority: 4,
      highlightRadius: 27,
      label: "เข้าบ้าน",
      action: () => {
        interactions.notify("ภายในบ้านจะเปิดให้เข้าในขั้นถัดไป");
        return false;
      },
    },
    {
      id: "well-use",
      x: 1135,
      y: 598,
      radius: 84,
      priority: 4,
      highlightRadius: 25,
      label: "ตักน้ำ",
      action: () => {
        interactions.notify("บ่อน้ำพร้อมแล้ว ระบบรดน้ำจะมาในขั้นถัดไป");
        return false;
      },
    },
  ];

  function getEntries() {
    return ENTRIES;
  }

  return { getEntries };
})();
