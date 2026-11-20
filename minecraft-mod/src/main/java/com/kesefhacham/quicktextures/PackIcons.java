package com.kesefhacham.quicktextures;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import com.mojang.blaze3d.platform.NativeImage;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.PackResources;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.server.packs.resources.IoSupplier;

/** Loads pack.png from each pack once and registers it as a texture. A pack without an icon gets null. */
final class PackIcons {
	private static final Map<String, Optional<Identifier>> CACHE = new HashMap<>();

	private PackIcons() {
	}

	static Identifier get(Minecraft client, Pack pack) {
		return CACHE.computeIfAbsent(pack.getId(), id -> Optional.ofNullable(load(client, pack))).orElse(null);
	}

	private static Identifier load(Minecraft client, Pack pack) {
		Identifier textureId = Identifier.fromNamespaceAndPath(QuickTexturesClient.MOD_ID, "pack_icon/" + safePath(pack.getId()));
		try (PackResources resources = pack.open()) {
			IoSupplier<InputStream> icon = resources.getRootResource("pack.png");
			if (icon == null) {
				return null;
			}
			try (InputStream in = icon.get()) {
				NativeImage image = NativeImage.read(in);
				DynamicTexture texture = new DynamicTexture(() -> "Quick Textures icon " + pack.getId(), image);
				client.getTextureManager().register(textureId, texture);
				return textureId;
			}
		} catch (Exception e) {
			// A broken icon must not break the menu - just show it without an icon.
			QuickTexturesClient.LOGGER.debug("Could not load icon for pack {}", pack.getId(), e);
			return null;
		}
	}

	/** Identifier allows only a-z0-9/._- so we clean the name and add a hash to prevent collisions. */
	private static String safePath(String packId) {
		String clean = packId.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "_");
		return clean + "_" + Integer.toHexString(packId.hashCode());
	}
}
