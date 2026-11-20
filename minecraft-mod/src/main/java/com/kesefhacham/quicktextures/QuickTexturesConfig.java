package com.kesefhacham.quicktextures;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;

import net.fabricmc.loader.api.FabricLoader;

/**
 * Saves the list of packs chosen as "my textures" to config/quicktextures.json.
 * Deliberately no "on/off" flag: the state is computed from what is actually enabled in the game.
 */
public final class QuickTexturesConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("quicktextures.json");

	/** The JSON file structure. */
	private static final class Data {
		List<String> packs = new ArrayList<>();
	}

	private static List<String> packs = new ArrayList<>();

	private QuickTexturesConfig() {
	}

	/** Pack ids (as in PackRepository, e.g. "file/MyPack.zip"), in the order they will be enabled. */
	public static List<String> getPacks() {
		return List.copyOf(packs);
	}

	public static void setPacks(List<String> newPacks) {
		packs = new ArrayList<>(newPacks);
		save();
	}

	public static void load() {
		if (!Files.exists(FILE)) {
			packs = new ArrayList<>();
			return;
		}
		try (Reader reader = Files.newBufferedReader(FILE, StandardCharsets.UTF_8)) {
			Data data = GSON.fromJson(reader, Data.class);
			packs = new ArrayList<>();
			if (data != null && data.packs != null) {
				for (String id : data.packs) {
					if (id != null && !id.isBlank() && !packs.contains(id)) {
						packs.add(id);
					}
				}
			}
		} catch (IOException | JsonParseException e) {
			QuickTexturesClient.LOGGER.warn("Could not read {}, starting with an empty list", FILE, e);
			packs = new ArrayList<>();
		}
	}

	public static void save() {
		Data data = new Data();
		data.packs = new ArrayList<>(packs);
		try {
			Files.createDirectories(FILE.getParent());
			try (Writer writer = Files.newBufferedWriter(FILE, StandardCharsets.UTF_8)) {
				GSON.toJson(data, writer);
			}
		} catch (IOException e) {
			QuickTexturesClient.LOGGER.error("Could not save {}", FILE, e);
		}
	}
}
