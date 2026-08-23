"use strict";

const DataModel = (() => {
  // Twój link do eksportu CSV z Google Sheets
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1TmRHJDv6IMlGwg761JV50M8vS4zXTdWBtjDziAleSQI/gviz/tq?tqx=out:csv&gid=586136597";

  function fetchSheetData(onSuccess, onError) {
    if (typeof Papa === "undefined") {
      console.error("Biblioteka PapaParse nie została załadowana!");
      if (onError) onError("Brak biblioteki PapaParse");
      return;
    }

    Papa.parse(SHEET_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        console.log("Pobrano dane z arkusza:", results.data.length);
        if (onSuccess) onSuccess(results.data);
      },
      error: function(err) {
        console.error("Błąd podczas parsowania CSV:", err);
        if (onError) onError(err);
      }
    });
  }

  return {
    fetchSheetData
  };
})();